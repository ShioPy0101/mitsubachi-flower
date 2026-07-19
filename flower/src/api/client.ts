import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { FlowerConfig } from "../config";
import { FlowerApiError, httpStatusToCode, toFlowerError } from "./errors";
import { ApiRequestResult, DownloadHeaders, FlowerDeviceAuthorization, FlowerDriveItem, FlowerDriveItemsPage, FlowerMe, FlowerTokenResponse } from "./types";
import { validateDeviceAuthorization, validateDriveItem, validateDriveItemsPage, validateFlowerMe, validateTokenResponse } from "./validation";

export type AccessTokenProvider = () => string | undefined;

export interface FlowerApiClientOptions {
  version: string;
  platformLabel?: string;
  accessTokenProvider?: AccessTokenProvider;
}

export interface StreamResponse {
  statusCode: number;
  headers: Record<string, string | undefined>;
  stream: Readable;
}

type HttpMethod = "GET" | "POST";

const MAX_JSON_BYTES = 1024 * 1024;
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export class FlowerApiClient {
  private readonly userAgent: string;
  private readonly accessTokenProvider: AccessTokenProvider;

  constructor(private readonly config: FlowerConfig, options: FlowerApiClientOptions) {
    this.userAgent = "mitsubachi-flower/" + options.version + " AE-CEP " + (options.platformLabel || "Windows");
    this.accessTokenProvider = options.accessTokenProvider || (() => this.config.developmentAccessToken || undefined);
  }

  async startDeviceAuthorization(input: { clientName: string; clientVersion: string; deviceName: string }, signal?: AbortSignal): Promise<ApiRequestResult<FlowerDeviceAuthorization>> {
    const response = await this.requestJson("POST", "/api/v1/flower/device_authorizations", "device_authorization_start", {
      client_name: input.clientName,
      client_version: input.clientVersion,
      device_name: input.deviceName
    }, signal, false);
    return { ...response, data: validateDeviceAuthorization(response.data) };
  }

  async pollDeviceToken(deviceCode: string, signal?: AbortSignal): Promise<ApiRequestResult<FlowerTokenResponse>> {
    const response = await this.requestJson("POST", "/api/v1/flower/tokens", "device_token_poll", {
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode
    }, signal, false);
    return { ...response, data: validateTokenResponse(response.data) };
  }

  async me(signal?: AbortSignal): Promise<ApiRequestResult<FlowerMe>> {
    const response = await this.requestJson("GET", "/api/v1/flower/me", "api_me", undefined, signal, true);
    return { ...response, data: validateFlowerMe(response.data) };
  }

  async listDriveItems(params: { query?: string; cursor?: string; limit?: number }, signal?: AbortSignal): Promise<ApiRequestResult<FlowerDriveItemsPage>> {
    const search = new URLSearchParams();
    if (params.query) search.set("query", params.query);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.limit) search.set("limit", String(params.limit));
    const path = "/api/v1/flower/drive_items" + (search.toString() ? "?" + search.toString() : "");
    const response = await this.requestJson("GET", path, "drive_items_list", undefined, signal, true);
    return { ...response, data: validateDriveItemsPage(response.data) };
  }

  async getDriveItem(id: string, signal?: AbortSignal): Promise<ApiRequestResult<FlowerDriveItem>> {
    assertId(id, "drive_item_show");
    const response = await this.requestJson("GET", "/api/v1/flower/drive_items/" + encodeURIComponent(id), "drive_item_show", undefined, signal, true);
    return { ...response, data: validateDriveItem(response.data, "drive_item_show") };
  }

  async downloadStream(id: string, signal?: AbortSignal): Promise<{ response: StreamResponse; downloadHeaders: DownloadHeaders }> {
    assertId(id, "download_started");
    const response = await this.requestStream("GET", "/api/v1/flower/drive_items/" + encodeURIComponent(id) + "/download", "download_started", signal, undefined, "application/octet-stream", true);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      await drain(response.stream);
      throw await this.httpError(response.statusCode, response.headers, "download_started", undefined);
    }
    return { response, downloadHeaders: extractDownloadHeaders(response.headers) };
  }

  private async requestJson(method: HttpMethod, requestPath: string, operation: string, body?: unknown, signal?: AbortSignal, authRequired = true): Promise<ApiRequestResult<unknown>> {
    const response = await this.requestStream(method, requestPath, operation, signal, body === undefined ? undefined : JSON.stringify(body), "application/json", authRequired);
    const requestId = response.headers["x-request-id"];
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_JSON_BYTES) throw new FlowerApiError({ code: "invalid_response", message: "API JSON response is too large.", retryable: false, operation, requestId, httpStatus: response.statusCode });
      chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (response.statusCode < 200 || response.statusCode >= 300) throw await this.httpError(response.statusCode, response.headers, operation, text);
    const contentType = response.headers["content-type"] || "";
    if (!/^application\/json\b/i.test(contentType)) {
      throw new FlowerApiError({ code: "invalid_response", message: "API returned a non-JSON response.", retryable: false, operation, requestId, httpStatus: response.statusCode });
    }
    try {
      return { data: text.length ? JSON.parse(text) : null, requestId, httpStatus: response.statusCode };
    } catch (error) {
      throw new FlowerApiError({ code: "invalid_json", message: "API returned invalid JSON.", retryable: false, operation, requestId, httpStatus: response.statusCode, causeName: error instanceof Error ? error.name : undefined });
    }
  }

  private async requestStream(method: HttpMethod, requestPath: string, operation: string, signal?: AbortSignal, body?: string, accept = "application/octet-stream", authRequired = true, redirects = 0): Promise<StreamResponse> {
    const accessToken = this.accessTokenProvider();
    if (authRequired && !accessToken) {
      throw new FlowerApiError({ code: "config_error", message: "Access token is not configured.", retryable: false, operation });
    }
    const url = new URL(requestPath, this.config.apiBaseUrl + "/");
    const timeoutMs = operation === "download_started" ? this.config.downloadTimeoutMs : this.config.requestTimeoutMs;
    const headers: Record<string, string> = { Accept: accept, "User-Agent": this.userAgent };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authRequired && accessToken) headers.Authorization = "Bearer " + accessToken;
    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(url, { method, headers, timeout: timeoutMs }, (res) => {
        const headers = normalizeHeaders(res.headers);
        const statusCode = res.statusCode || 0;
        if (isRedirect(statusCode) && headers.location) {
          res.resume();
          try {
            if (redirects >= 3) throw new FlowerApiError({ code: "invalid_response", message: "API redirect limit exceeded.", retryable: false, operation, httpStatus: statusCode, requestId: headers["x-request-id"] });
            const next = new URL(headers.location, url);
            if (url.protocol === "https:" && next.protocol !== "https:") throw new FlowerApiError({ code: "invalid_response", message: "Refusing HTTPS to HTTP redirect.", retryable: false, operation, httpStatus: statusCode, requestId: headers["x-request-id"] });
            if (next.origin !== url.origin) {
              throw new FlowerApiError({ code: "invalid_response", message: "Refusing cross-origin authenticated redirect.", retryable: false, operation, httpStatus: statusCode, requestId: headers["x-request-id"] });
            }
            this.requestStream(method, next.pathname + next.search, operation, signal, body, accept, authRequired, redirects + 1).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        resolve({ statusCode, headers, stream: res });
      });
      request.on("timeout", () => {
        request.destroy(new FlowerApiError({ code: "timeout", message: "API request timed out.", retryable: true, operation }));
      });
      request.on("error", (error) => reject(toFlowerError(error, operation)));
      if (signal) {
        if (signal.aborted) {
          request.destroy(new FlowerApiError({ code: "cancelled", message: "Operation was cancelled.", retryable: true, operation }));
          return;
        }
        signal.addEventListener("abort", () => request.destroy(new FlowerApiError({ code: "cancelled", message: "Operation was cancelled.", retryable: true, operation })), { once: true });
      }
      if (body) request.write(body);
      request.end();
    });
  }

  private async httpError(status: number, headers: Record<string, string | undefined>, operation: string, text?: string): Promise<FlowerApiError> {
    let serverCode: string | undefined;
    let serverMessage: string | undefined;
    let requestId = headers["x-request-id"];
    if (text && /^application\/json\b/i.test(headers["content-type"] || "")) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (parsed.error && typeof parsed.error === "object") {
          const error = parsed.error as Record<string, unknown>;
          serverCode = typeof error.code === "string" ? error.code : undefined;
          serverMessage = typeof error.message === "string" ? error.message : undefined;
          requestId = typeof error.request_id === "string" ? error.request_id : requestId;
        }
      } catch {
        // Keep sanitized generic message below.
      }
    }
    const code = httpStatusToCode(status, serverCode);
    const retryable = code === "rate_limited" || code === "server_error" || serverCode === "authorization_pending" || serverCode === "slow_down";
    const safeMessage = code === "unauthorized" ? "Authentication failed." : code === "forbidden" || code === "insufficient_scope" ? "Access to this flower resource is forbidden." : serverMessage && status < 500 ? serverMessage : "Flower API request failed.";
    return new FlowerApiError({ code, message: safeMessage, retryable, operation, httpStatus: status, requestId, serverCode });
  }
}

export function extractDownloadHeaders(headers: Record<string, string | undefined>): DownloadHeaders {
  const contentLength = headers["content-length"] && /^\d+$/.test(headers["content-length"] || "") ? Number(headers["content-length"]) : undefined;
  return {
    contentType: headers["content-type"],
    contentLength,
    contentDisposition: headers["content-disposition"],
    etag: headers.etag,
    acceptRanges: headers["accept-ranges"],
    driveItemId: headers["x-mitsubachi-drive-item-id"],
    sha256: headers["x-mitsubachi-file-sha256"],
    updatedAt: headers["x-mitsubachi-updated-at"],
    requestId: headers["x-request-id"]
  };
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

function isRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}

function assertId(id: string, operation: string): void {
  if (!/^\d+$/.test(id)) throw new FlowerApiError({ code: "invalid_response", message: "Drive item ID is invalid.", retryable: false, operation });
}

async function drain(stream: Readable): Promise<void> {
  for await (const _ of stream) {
    // drain
  }
}




