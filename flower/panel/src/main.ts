import { execFile } from "node:child_process";
import path from "node:path";
import { FlowerApiClient } from "../../src/api/client";
import { FlowerApiError } from "../../src/api/errors";
import { FlowerDriveItem, FlowerMe } from "../../src/api/types";
import { writeAuditLog } from "../../src/auditLog";
import { commitDownloadedStream, flowerCacheRoot, inspectCache, verifyCachedPayload, CacheInspection, DownloadProgress } from "../../src/cache";
import { FlowerConfig, loadFlowerConfig } from "../../src/config";
import { createProjectMetadata } from "../../src/metadata";
import { anonymizeDiagnostics, redactSecrets } from "../../src/redaction";
import { makeJsonCall, parseBridgeResponse } from "../../src/bridge";

const packageJson = require("../../package.json") as { version: string };

declare global {
  interface Window {
    CSInterface?: new () => { evalScript(script: string, callback: (result: string) => void): void };
  }
}

type LogChannel = "ui" | "jsx" | "cache" | "api" | "error";
type ItemUiState = { cache: string; download: string; importState: string; progress?: DownloadProgress };

const logs: Record<LogChannel, string[]> = { ui: [], jsx: [], cache: [], api: [], error: [] };
let activeLog: LogChannel = "ui";
let config: FlowerConfig | null = null;
let client: FlowerApiClient | null = null;
let me: FlowerMe | null = null;
let items: FlowerDriveItem[] = [];
let itemStates = new Map<string, ItemUiState>();
let nextCursor: string | null = null;
let listGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let currentDownload: { itemId: string; controller: AbortController } | null = null;
let latestRequestId = "none";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element as T;
}

function setText(id: string, value: string, className?: string): void {
  const element = byId<HTMLElement>(id);
  element.textContent = value;
  element.className = className || "";
}

function writeResult(value: unknown): void {
  byId("result-log").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function log(channel: LogChannel, message: string): void {
  logs[channel].push(new Date().toISOString() + " " + redactSecrets(message));
  if (channel === activeLog) byId("active-log").textContent = logs[channel].join("\n");
}

async function audit(level: "debug" | "info" | "warn" | "error", operation: string, message: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    await writeAuditLog({ level, flowerVersion: packageJson.version, operation, message, ...(extra as object) });
  } catch (error) {
    log("error", "audit log failed: " + (error instanceof Error ? error.message : String(error)));
  }
}

function updateButtons(): void {
  byId<HTMLButtonElement>("btn-cancel").disabled = !currentDownload;
  byId<HTMLButtonElement>("btn-reload").disabled = !client || !me;
  byId<HTMLButtonElement>("btn-load-more").disabled = !client || !nextCursor;
}

function setConnection(value: string, className?: string): void {
  setText("connection-status", value, className);
}

function updateRequestId(requestId?: string): void {
  if (!requestId) return;
  latestRequestId = requestId;
  setText("request-id", requestId);
}

function callAe<T>(functionName: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!window.CSInterface) {
      reject(new Error("CSInterface is not available."));
      return;
    }
    const cs = new window.CSInterface();
    const script = makeJsonCall(functionName, payload);
    log("ui", "evalScript " + functionName);
    cs.evalScript(script, (result: string) => {
      log("jsx", result);
      const parsed = parseBridgeResponse<T>(result);
      if (parsed.ok) resolve(parsed.data);
      else reject(new FlowerApiError({ code: "ae_import_error", message: parsed.error.message, retryable: false, operation: functionName }));
    });
  });
}

async function initialize(): Promise<void> {
  setText("flower-version", packageJson.version);
  setText("bridge-status", window.CSInterface ? "checking" : "unavailable", window.CSInterface ? "warn" : "error");
  bindEvents();
  await loadConfigIntoState();
  await probeAe();
  updateButtons();
}

async function loadConfigIntoState(): Promise<void> {
  const loaded = await loadFlowerConfig();
  if (!loaded.ok || !loaded.config) {
    config = null;
    client = null;
    setConnection(loaded.error?.details.message || "Not configured", "warn");
    setText("api-base-url", "not configured", "warn");
    log("error", loaded.error?.details.message || "config load failed");
    await audit("warn", "config_loaded", loaded.error?.details.message || "Config load failed.", { result: "failure", errorCategory: "config_error" });
    return;
  }
  config = loaded.config;
  client = new FlowerApiClient(config, { version: packageJson.version });
  setConnection(config.developmentAccessToken ? "Configured" : "Token missing", config.developmentAccessToken ? "warn" : "error");
  setText("api-base-url", config.apiBaseUrl);
  log("ui", "config loaded from " + config.configPath + " token=" + (config.developmentAccessToken ? "[configured]" : "[missing]"));
  await audit("info", "config_loaded", "Config loaded.", { result: "success" });
}

async function probeAe(): Promise<void> {
  try {
    const result = await callAe<{ aeVersion?: string }>("probe");
    setText("bridge-status", "OK", "ok");
    setText("ae-version", result.aeVersion || "unknown");
  } catch (error) {
    setText("bridge-status", "ERROR", "error");
    logError(error, "ae_probe");
  }
}

async function connect(): Promise<void> {
  if (!client) {
    await loadConfigIntoState();
    if (!client) return;
  }
  setConnection("Connecting", "warn");
  try {
    const started = Date.now();
    const result = await client.me();
    me = result.data;
    updateRequestId(result.requestId);
    setText("user-display-name", me.displayName);
    setText("organization-name", me.organizationName);
    setText("scopes", me.scopes.length ? me.scopes.join(", ") : "none");
    setText("last-connected-at", new Date().toISOString());
    setConnection("Connected", "ok");
    log("api", "connected requestId=" + (result.requestId || "none"));
    await audit("info", "api_me", "Connected to flower API.", { result: "success", durationMs: Date.now() - started, requestId: result.requestId, httpStatus: result.httpStatus, organizationId: me.organizationId });
    await reloadFiles(false);
  } catch (error) {
    const flowerError = logError(error, "api_me");
    setConnection(connectionLabel(flowerError), "error");
    await audit("error", "api_me", flowerError.details.message, { result: "failure", requestId: flowerError.details.requestId, httpStatus: flowerError.details.httpStatus, errorCategory: flowerError.details.code });
  } finally {
    updateButtons();
  }
}

async function reloadFiles(loadMore: boolean): Promise<void> {
  if (!client || !me) {
    setListState("Connect before loading files.", "warn");
    return;
  }
  const generation = ++listGeneration;
  const query = byId<HTMLInputElement>("search-input").value.trim();
  const cursor = loadMore ? nextCursor || undefined : undefined;
  if (!loadMore) {
    items = [];
    nextCursor = null;
    itemStates = new Map();
    renderItems();
  }
  setListState("Loading", "warn");
  try {
    const started = Date.now();
    const result = await client.listDriveItems({ query, cursor, limit: 50 });
    if (generation !== listGeneration) return;
    updateRequestId(result.requestId);
    const seen = new Set(items.map((item) => item.id));
    for (const item of result.data.items) {
      if (!seen.has(item.id)) {
        items.push(item);
        seen.add(item.id);
      }
    }
    nextCursor = result.data.nextCursor;
    await refreshCacheStates();
    setListState(items.length ? "Loaded " + items.length + " item(s)" : "No image/video files found", items.length ? "ok" : "warn");
    await audit("info", "drive_items_list", "Drive items loaded.", { result: "success", durationMs: Date.now() - started, requestId: result.requestId, httpStatus: result.httpStatus, organizationId: me.organizationId });
  } catch (error) {
    const flowerError = logError(error, "drive_items_list");
    setListState(flowerError.details.message + requestSuffix(flowerError.details.requestId), "error");
  } finally {
    updateButtons();
  }
}

async function refreshCacheStates(): Promise<void> {
  if (!me) return;
  for (const item of items) {
    const inspected = await inspectCache(flowerCacheRoot(), item, me.organizationId);
    const previous = itemStates.get(item.id);
    itemStates.set(item.id, { cache: inspected.state, download: previous?.download || "idle", importState: previous?.importState || "not imported" });
  }
  renderItems();
}

function renderItems(): void {
  const container = byId("items-list");
  container.textContent = "";
  for (const item of items) {
    const state = itemStates.get(item.id) || { cache: "not cached", download: "idle", importState: "not imported" };
    const row = document.createElement("div");
    row.className = "item-row";
    const main = document.createElement("div");
    main.className = "item-main";
    const name = document.createElement("strong");
    name.textContent = item.displayName;
    const hash = document.createElement("span");
    hash.textContent = item.sha256.slice(0, 19) + "...";
    main.appendChild(name);
    main.appendChild(hash);
    row.appendChild(main);
    row.appendChild(meta(item.contentType));
    row.appendChild(meta(formatBytes(item.fileSize)));
    row.appendChild(meta(item.updatedAt));
    row.appendChild(meta(state.cache + " / " + state.download + " / " + state.importState));
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.appendChild(button("Download", () => downloadItem(item, false)));
    actions.appendChild(button("Download and Import", () => downloadItem(item, true)));
    actions.appendChild(button("Import Cached", () => importCachedItem(item)));
    actions.appendChild(button("Details", () => showDetails(item)));
    row.appendChild(actions);
    container.appendChild(row);
  }
}

function meta(value: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "item-meta";
  element.textContent = value;
  return element;
}

function button(label: string, handler: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", handler);
  return element;
}

async function downloadItem(item: FlowerDriveItem, importAfter: boolean): Promise<void> {
  if (!client || !me) return;
  if (currentDownload) {
    setListState("Another download is already running.", "warn");
    return;
  }
  const controller = new AbortController();
  currentDownload = { itemId: item.id, controller };
  setItemState(item.id, { cache: "downloading", download: "downloading", importState: itemStates.get(item.id)?.importState || "not imported" });
  updateButtons();
  try {
    const detail = await client.getDriveItem(item.id, controller.signal);
    updateRequestId(detail.requestId);
    const stream = await client.downloadStream(item.id, controller.signal);
    updateRequestId(stream.downloadHeaders.requestId);
    const result = await commitDownloadedStream({ item: detail.data, organizationId: me.organizationId, stream: stream.response.stream, headers: stream.downloadHeaders, cacheRoot: flowerCacheRoot(), signal: controller.signal, onProgress: (progress) => updateProgress(item.id, progress) });
    setItemState(item.id, { cache: "cached", download: result.reused ? "cache hit" : "completed", importState: itemStates.get(item.id)?.importState || "not imported" });
    log("cache", "download completed item=" + item.id + " bytes=" + result.actualBytes + " requestId=" + (result.requestId || "none"));
    await audit("info", result.reused ? "cache_hit" : "download_completed", "Download completed.", { result: "success", requestId: result.requestId, driveItemId: item.id, organizationId: me.organizationId, expectedBytes: detail.data.fileSize, actualBytes: result.actualBytes, expectedSha256: detail.data.sha256, actualSha256: result.actualSha256 });
    if (importAfter) await importCachedItem(detail.data);
  } catch (error) {
    const flowerError = logError(error, "download_failed");
    const cancelled = flowerError.details.code === "cancelled";
    setItemState(item.id, { cache: cancelled ? "not cached" : "error", download: cancelled ? "cancelled" : "failed", importState: itemStates.get(item.id)?.importState || "not imported" });
    await audit(cancelled ? "warn" : "error", cancelled ? "download_cancelled" : "download_failed", flowerError.details.message, { result: cancelled ? "cancelled" : "failure", requestId: flowerError.details.requestId, driveItemId: item.id, organizationId: me.organizationId, errorCategory: flowerError.details.code });
  } finally {
    if (currentDownload?.itemId === item.id) currentDownload = null;
    updateButtons();
  }
}

async function importCachedItem(item: FlowerDriveItem): Promise<void> {
  if (!me) return;
  try {
    const inspected = await verifyCachedPayload(flowerCacheRoot(), item, me.organizationId);
    if (inspected.state !== "cached" || !inspected.metadata) {
      setItemState(item.id, { cache: inspected.state, download: "idle", importState: "blocked" });
      throw new FlowerApiError({ code: "disk_error", message: "Cached file is not ready for import: " + inspected.state, retryable: true, operation: "ae_import_started" });
    }
    const duplicates = await scanProjectMetadata(false);
    const duplicate = duplicates.find((entry) => entry.metadata && (entry.metadata.driveItemId === item.id || entry.metadata.sha256 === item.sha256));
    if (duplicate && !window.confirm("This Mitsubachi item or SHA-256 already exists in the AE project. Import a new copy?")) {
      setItemState(item.id, { cache: "cached", download: "idle", importState: "cancelled" });
      return;
    }
    const metadata = createProjectMetadata({ driveItemId: item.id, organizationId: me.organizationId, sha256: item.sha256, serverUpdatedAt: item.updatedAt, localCachePath: inspected.payloadPath });
    await audit("info", "ae_import_started", "AE import started.", { result: "success", driveItemId: item.id, organizationId: me.organizationId });
    const result = await callAe("importCachedFile", { localCachePath: inspected.payloadPath, metadata });
    setItemState(item.id, { cache: "cached", download: "idle", importState: "imported" });
    writeResult(result);
    await audit("info", "ae_import_completed", "AE import completed.", { result: "success", driveItemId: item.id, organizationId: me.organizationId, expectedSha256: item.sha256 });
  } catch (error) {
    const flowerError = logError(error, "ae_import_failed");
    setItemState(item.id, { cache: itemStates.get(item.id)?.cache || "error", download: "idle", importState: "failed" });
    await audit("error", "ae_import_failed", flowerError.details.message, { result: "failure", driveItemId: item.id, organizationId: me.organizationId, errorCategory: flowerError.details.code });
  }
}

async function scanProjectMetadata(show = true): Promise<Array<{ item?: unknown; metadata?: { driveItemId?: string; sha256?: string }; error?: string }>> {
  const result = await callAe<{ items: Array<{ item?: unknown; metadata?: { driveItemId?: string; sha256?: string }; error?: string }> }>("scanProjectMetadata");
  if (show) writeResult(result);
  return result.items;
}

function cancelDownload(): void {
  if (!currentDownload) return;
  currentDownload.controller.abort();
}

function updateProgress(itemId: string, progress: DownloadProgress): void {
  const total = progress.totalBytes ? " / " + formatBytes(progress.totalBytes) + " " + Math.floor((progress.downloadedBytes / progress.totalBytes) * 100) + "%" : "";
  setItemState(itemId, { cache: progress.operation === "verifying" ? "verifying" : "downloading", download: formatBytes(progress.downloadedBytes) + total + " " + formatBytes(progress.bytesPerSecond) + "/s", importState: itemStates.get(itemId)?.importState || "not imported", progress });
}

function setItemState(itemId: string, state: ItemUiState): void {
  itemStates.set(itemId, state);
  renderItems();
}

function showDetails(item: FlowerDriveItem): void {
  writeResult({ item, state: itemStates.get(item.id) });
}

function setListState(value: string, className?: string): void {
  const element = byId("list-state");
  element.textContent = value;
  element.className = "state " + (className || "");
}

function logError(error: unknown, operation: string): FlowerApiError {
  const flowerError = error instanceof FlowerApiError ? error : new FlowerApiError({ code: "network_error", message: error instanceof Error ? error.message : String(error), retryable: false, operation, causeName: error instanceof Error ? error.name : undefined });
  updateRequestId(flowerError.details.requestId);
  log("error", operation + ": " + flowerError.details.code + " " + flowerError.details.message + requestSuffix(flowerError.details.requestId));
  writeResult({ error: flowerError.details });
  return flowerError;
}

function connectionLabel(error: FlowerApiError): string {
  if (error.details.code === "unauthorized") return "Authentication failed";
  if (error.details.code === "timeout") return "API unavailable";
  if (error.details.code === "network_error" || error.details.code === "tls_error") return "Offline";
  return "API unavailable";
}

function requestSuffix(requestId?: string): string {
  return requestId ? " Request ID: " + requestId : "";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return (unit === 0 ? String(amount) : amount.toFixed(1)) + " " + units[unit];
}

function openFolder(folderPath: string): void {
  execFile("explorer.exe", [folderPath], (error) => {
    if (error) log("error", "open folder failed: " + error.message);
  });
}

async function copyDiagnostics(): Promise<void> {
  const diagnostics = anonymizeDiagnostics(JSON.stringify({ connection: byId("connection-status").textContent, apiBaseUrl: config?.apiBaseUrl, flowerVersion: packageJson.version, aeVersion: byId("ae-version").textContent, user: me ? { id: me.id, displayName: me.displayName, organizationId: me.organizationId, organizationName: me.organizationName, scopes: me.scopes } : null, latestRequestId, itemCount: items.length, currentDownload: currentDownload?.itemId || null, logs }, null, 2));
  try {
    await navigator.clipboard.writeText(diagnostics);
    log("ui", "diagnostics copied");
  } catch {
    writeResult(diagnostics);
  }
}

function bindEvents(): void {
  byId("btn-connect").addEventListener("click", () => connect());
  byId("btn-reload").addEventListener("click", () => reloadFiles(false));
  byId("btn-load-more").addEventListener("click", () => reloadFiles(true));
  byId("btn-cancel").addEventListener("click", cancelDownload);
  byId("btn-open-cache").addEventListener("click", () => openFolder(flowerCacheRoot()));
  byId("btn-open-log").addEventListener("click", () => openFolder(path.join(process.env.LOCALAPPDATA || "", "Mitsubachi", "Flower", "logs")));
  byId("btn-copy-diagnostics").addEventListener("click", () => copyDiagnostics());
  byId("btn-scan").addEventListener("click", () => scanProjectMetadata(true).catch((error) => logError(error, "scan_project_metadata")));
  byId<HTMLInputElement>("search-input").addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => reloadFiles(false), 350);
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-log]"), (button: HTMLButtonElement) => {
    button.addEventListener("click", () => {
      activeLog = button.getAttribute("data-log") as LogChannel;
      Array.prototype.forEach.call(document.querySelectorAll("[data-log]"), (b: HTMLButtonElement) => b.classList.remove("active"));
      button.classList.add("active");
      byId("active-log").textContent = logs[activeLog].join("\n");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => initialize().catch((error) => logError(error, "initialize")));

