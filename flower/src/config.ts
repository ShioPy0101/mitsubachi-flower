import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowerApiError } from "./api/errors";

export interface FlowerConfig {
  apiBaseUrl: string;
  developmentAccessToken: string | null;
  requestTimeoutMs: number;
  downloadTimeoutMs: number;
  maxConcurrentDownloads: number;
  configPath: string;
  environment: "development" | "test" | "production";
}

export interface ConfigLoadResult {
  ok: boolean;
  config?: FlowerConfig;
  error?: FlowerApiError;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300000;

export function flowerConfigDir(): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Mitsubachi", "Flower", "config");
}

export function flowerConfigPath(): string {
  return path.join(flowerConfigDir(), "development.json");
}

export async function loadFlowerConfig(environment = flowerEnvironment()): Promise<ConfigLoadResult> {
  const configPath = flowerConfigPath();
  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: configError("Flower development config was not found.", configPath) };
    }
    return { ok: false, error: configError("Flower development config could not be read.", configPath, error) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: configError("Flower development config is not valid JSON.", configPath, error) };
  }

  try {
    const config = parseFlowerConfig(raw, configPath, environment);
    return { ok: true, config };
  } catch (error) {
    return { ok: false, error: error instanceof FlowerApiError ? error : configError("Flower development config is invalid.", configPath, error) };
  }
}

export function parseFlowerConfig(raw: unknown, configPath = flowerConfigPath(), environment = flowerEnvironment()): FlowerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw configError("Flower config must be a JSON object.", configPath);
  const record = raw as Record<string, unknown>;
  const apiBaseUrl = normalizeApiBaseUrl(record.apiBaseUrl);
  const developmentAccessToken = parseToken(record.developmentAccessToken, environment, configPath);
  return {
    apiBaseUrl,
    developmentAccessToken,
    requestTimeoutMs: positiveInteger(record.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs", configPath),
    downloadTimeoutMs: positiveInteger(record.downloadTimeoutMs, DEFAULT_DOWNLOAD_TIMEOUT_MS, "downloadTimeoutMs", configPath),
    maxConcurrentDownloads: positiveInteger(record.maxConcurrentDownloads, 1, "maxConcurrentDownloads", configPath),
    configPath,
    environment
  };
}

export function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw configError("apiBaseUrl is required.", flowerConfigPath());
  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw configError("apiBaseUrl is not a valid URL.", flowerConfigPath());
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost(url.hostname))) {
    throw configError("apiBaseUrl must use HTTPS except localhost development.", flowerConfigPath());
  }
  return url.toString().replace(/\/+$/, "");
}

export function flowerEnvironment(): "development" | "test" | "production" {
  const value = process.env.FLOWER_ENV || process.env.NODE_ENV || "development";
  return value === "production" ? "production" : value === "test" ? "test" : "development";
}

function parseToken(value: unknown, environment: FlowerConfig["environment"], configPath: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw configError("developmentAccessToken must be a string.", configPath);
  if (environment === "production") throw configError("developmentAccessToken is disabled in production builds.", configPath);
  return value;
}

function positiveInteger(value: unknown, fallback: number, field: string, configPath: string): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw configError(field + " must be a positive integer.", configPath);
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function configError(message: string, configPath: string, cause?: unknown): FlowerApiError {
  return new FlowerApiError({ code: "config_error", message, retryable: false, operation: "config_loaded", causeName: cause instanceof Error ? cause.name : undefined });
}
