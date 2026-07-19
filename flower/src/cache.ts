import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FlowerApiError } from "./api/errors";
import { DownloadHeaders, FlowerDriveItem } from "./api/types";

export interface CacheFixture {
  driveItemId: string;
  name: string;
  fileHash: string;
  fileSize: number;
  contentType: string;
}

export interface CacheLogEntry {
  level: "info" | "warn" | "error";
  message: string;
}

export interface CacheResult {
  reused: boolean;
  cachePath: string;
  actualHash: string;
  logs: CacheLogEntry[];
}

export interface FlowerCacheMetadata {
  schema: "mitsubachi.flower.cache/v1";
  driveItemId: string;
  organizationId: string;
  displayName: string;
  extension: string | null;
  contentType: string;
  fileSize: number;
  sha256: string;
  serverUpdatedAt: string;
  downloadedAt: string;
  lastAccessAt: string;
  payloadFileName: string;
}

export type CacheState = "not cached" | "downloading" | "verifying" | "cached" | "stale" | "corrupt" | "error";

export interface CacheInspection {
  state: CacheState;
  payloadPath: string;
  metadataPath: string;
  metadata?: FlowerCacheMetadata;
  reason?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  elapsedMs: number;
  bytesPerSecond: number;
  operation: string;
  requestId?: string;
}

export interface CommitDownloadOptions {
  item: FlowerDriveItem;
  organizationId: string;
  stream: Readable;
  headers: DownloadHeaders;
  cacheRoot: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface CommitDownloadResult {
  cachePath: string;
  metadataPath: string;
  metadata: FlowerCacheMetadata;
  actualSha256: string;
  actualBytes: number;
  requestId?: string;
  reused: boolean;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return "sha256:" + hash.digest("hex");
}

export function normalizeSha256(fileHash: string): string {
  if (!/^sha256:[a-fA-F0-9]{64}$/.test(fileHash)) {
    throw new Error("Unsupported fileHash. Expected sha256:<64 hex chars>.");
  }
  return fileHash.slice("sha256:".length).toLowerCase();
}

export function flowerCacheRoot(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Mitsubachi", "Flower", "cache");
}

export function cacheDirForHash(cacheRoot: string, fileHash: string): string {
  const hex = normalizeSha256(fileHash);
  return path.join(cacheRoot, "sha256", hex.slice(0, 2), hex);
}

export function cachePathForHash(cacheRoot: string, fileHash: string, fileName: string): string {
  const extension = path.extname(fileName) || ".bin";
  return path.join(cacheDirForHash(cacheRoot, fileHash), "payload" + extension);
}

export function cachePathsForItem(cacheRoot: string, item: FlowerDriveItem): { dir: string; payloadPath: string; metadataPath: string; payloadFileName: string } {
  const dir = cacheDirForHash(cacheRoot, item.sha256);
  const extension = safeExtension(item.extension || path.extname(item.displayName).replace(/^\./, ""));
  const payloadFileName = "payload" + (extension ? "." + extension : ".bin");
  return { dir, payloadPath: path.join(dir, payloadFileName), metadataPath: path.join(dir, "metadata.json"), payloadFileName };
}

export function tempPathFor(cachePath: string): string {
  return cachePath + ".tmp-" + process.pid + "-" + Date.now();
}

export async function inspectCache(cacheRoot: string, item: FlowerDriveItem, organizationId: string): Promise<CacheInspection> {
  const paths = cachePathsForItem(cacheRoot, item);
  let metadata: FlowerCacheMetadata;
  try {
    metadata = await readCacheMetadata(paths.metadataPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { state: code === "ENOENT" ? "not cached" : "corrupt", payloadPath: paths.payloadPath, metadataPath: paths.metadataPath, reason: code === "ENOENT" ? undefined : "metadata invalid" };
  }
  try {
    const payloadStat = await stat(paths.payloadPath);
    if (!payloadStat.isFile()) return corrupt(paths, metadata, "payload is not a file");
    if (payloadStat.size !== item.fileSize || metadata.fileSize !== item.fileSize) return corrupt(paths, metadata, "size mismatch");
    if (metadata.sha256 !== item.sha256) return corrupt(paths, metadata, "hash metadata mismatch");
    if (metadata.organizationId !== organizationId) return corrupt(paths, metadata, "organization mismatch");
    if (metadata.driveItemId === item.id && metadata.serverUpdatedAt !== item.updatedAt) return { state: "stale", payloadPath: paths.payloadPath, metadataPath: paths.metadataPath, metadata, reason: "server updated_at changed" };
    return { state: "cached", payloadPath: paths.payloadPath, metadataPath: paths.metadataPath, metadata };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { state: code === "ENOENT" ? "corrupt" : "error", payloadPath: paths.payloadPath, metadataPath: paths.metadataPath, metadata, reason: code === "ENOENT" ? "payload missing" : "payload stat failed" };
  }
}

export async function verifyCachedPayload(cacheRoot: string, item: FlowerDriveItem, organizationId: string): Promise<CacheInspection> {
  const inspected = await inspectCache(cacheRoot, item, organizationId);
  if (inspected.state !== "cached") return inspected;
  const actual = await sha256File(inspected.payloadPath);
  if (actual !== item.sha256) return { ...inspected, state: "corrupt", reason: "payload hash mismatch" };
  return inspected;
}

export async function commitDownloadedStream(options: CommitDownloadOptions): Promise<CommitDownloadResult> {
  const cacheHit = await verifyCachedPayload(options.cacheRoot, options.item, options.organizationId);
  if (cacheHit.state === "cached" && cacheHit.metadata) {
    const updated = { ...cacheHit.metadata, driveItemId: options.item.id, organizationId: options.organizationId, lastAccessAt: new Date().toISOString() };
    await writeCacheMetadataAtomic(cacheHit.metadataPath, updated);
    return { cachePath: cacheHit.payloadPath, metadataPath: cacheHit.metadataPath, metadata: updated, actualSha256: options.item.sha256, actualBytes: options.item.fileSize, requestId: options.headers.requestId, reused: true };
  }

  if (options.headers.sha256 && options.headers.sha256 !== options.item.sha256) {
    throw new FlowerApiError({ code: "hash_mismatch", message: "Download hash header did not match item metadata.", retryable: true, operation: "download_started", requestId: options.headers.requestId });
  }
  if (options.headers.driveItemId && options.headers.driveItemId !== options.item.id) {
    throw new FlowerApiError({ code: "invalid_response", message: "Download drive item header did not match selected item.", retryable: false, operation: "download_started", requestId: options.headers.requestId });
  }

  const paths = cachePathsForItem(options.cacheRoot, options.item);
  await mkdir(paths.dir, { recursive: true });
  const suffix = ".part-" + process.pid + "-" + randomBytes(4).toString("hex");
  const payloadTemporary = paths.payloadPath + suffix;
  const metadataTemporary = paths.metadataPath + suffix;
  const hash = createHash("sha256");
  const startedAt = Date.now();
  let downloadedBytes = 0;
  let lastProgressAt = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(payloadTemporary, { flags: "wx" });
      const cleanupReject = (error: unknown) => reject(error);
      output.on("error", cleanupReject);
      options.stream.on("error", cleanupReject);
      if (options.signal) {
        if (options.signal.aborted) {
          reject(new FlowerApiError({ code: "cancelled", message: "Download was cancelled.", retryable: true, operation: "download_cancelled", requestId: options.headers.requestId }));
          return;
        }
        options.signal.addEventListener("abort", () => {
          options.stream.destroy(new FlowerApiError({ code: "cancelled", message: "Download was cancelled.", retryable: true, operation: "download_cancelled", requestId: options.headers.requestId }));
          output.destroy();
        }, { once: true });
      }
      options.stream.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (options.onProgress && now - lastProgressAt >= 150) {
          lastProgressAt = now;
          options.onProgress(progress(downloadedBytes, options.headers.contentLength, startedAt, options.headers.requestId, "downloading"));
        }
      });
      options.stream.pipe(output);
      output.on("finish", () => resolve());
    });

    const actualSha256 = "sha256:" + hash.digest("hex");
    options.onProgress?.(progress(downloadedBytes, options.headers.contentLength, startedAt, options.headers.requestId, "verifying"));
    if (options.headers.contentLength !== undefined && options.headers.contentLength !== downloadedBytes) throw sizeError("Content-Length did not match downloaded bytes.", options.headers.requestId);
    if (downloadedBytes !== options.item.fileSize) throw sizeError("Downloaded bytes did not match API file size.", options.headers.requestId);
    const payloadStat = await stat(payloadTemporary);
    if (payloadStat.size !== options.item.fileSize) throw sizeError("Local file size did not match API file size.", options.headers.requestId);
    if (actualSha256 !== options.item.sha256) {
      throw new FlowerApiError({ code: "hash_mismatch", message: "SHA-256 did not match the server metadata.", retryable: true, operation: "hash_mismatch", requestId: options.headers.requestId });
    }

    const now = new Date().toISOString();
    const metadata: FlowerCacheMetadata = {
      schema: "mitsubachi.flower.cache/v1",
      driveItemId: options.item.id,
      organizationId: options.organizationId,
      displayName: options.item.displayName,
      extension: options.item.extension,
      contentType: options.item.contentType,
      fileSize: options.item.fileSize,
      sha256: options.item.sha256,
      serverUpdatedAt: options.headers.updatedAt || options.item.updatedAt,
      downloadedAt: now,
      lastAccessAt: now,
      payloadFileName: paths.payloadFileName
    };
    await writeFile(metadataTemporary, JSON.stringify(metadata, null, 2), "utf8");
    await retryFs(() => rename(payloadTemporary, paths.payloadPath));
    await retryFs(() => rename(metadataTemporary, paths.metadataPath));
    options.onProgress?.(progress(downloadedBytes, options.headers.contentLength, startedAt, options.headers.requestId, "cached"));
    return { cachePath: paths.payloadPath, metadataPath: paths.metadataPath, metadata, actualSha256, actualBytes: downloadedBytes, requestId: options.headers.requestId, reused: false };
  } catch (error) {
    await rm(payloadTemporary, { force: true }).catch(() => undefined);
    await rm(metadataTemporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readCacheMetadata(metadataPath: string): Promise<FlowerCacheMetadata> {
  const raw = JSON.parse(await readFile(metadataPath, "utf8")) as FlowerCacheMetadata;
  if (!raw || raw.schema !== "mitsubachi.flower.cache/v1" || typeof raw.driveItemId !== "string" || typeof raw.organizationId !== "string" || typeof raw.payloadFileName !== "string" || typeof raw.fileSize !== "number" || typeof raw.sha256 !== "string") {
    throw new Error("Invalid cache metadata.");
  }
  normalizeSha256(raw.sha256);
  return raw;
}

export async function writeCacheMetadataAtomic(metadataPath: string, metadata: FlowerCacheMetadata): Promise<void> {
  const temporary = metadataPath + ".part-" + process.pid + "-" + randomBytes(4).toString("hex");
  await writeFile(temporary, JSON.stringify(metadata, null, 2), "utf8");
  await retryFs(() => rename(temporary, metadataPath));
}

export async function retryFs<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [100, 250, 500, 1000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES" || attempt === delays.length) break;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw new FlowerApiError({ code: "disk_error", message: "Cache file operation failed.", retryable: true, operation: "cache_commit", causeName: lastError instanceof Error ? lastError.name : undefined });
}

export async function ensureFixtureCached(sourcePath: string, fixture: CacheFixture, cacheRoot: string): Promise<CacheResult> {
  const logs: CacheLogEntry[] = [];
  const cachePath = cachePathForHash(cacheRoot, fixture.fileHash, fixture.name);
  const cached = await existingValidCache(cachePath, fixture.fileHash);
  if (cached) {
    logs.push({ level: "info", message: "Existing cache reused: " + cachePath });
    return { reused: true, cachePath, actualHash: fixture.fileHash, logs };
  }

  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporary = tempPathFor(cachePath);
  logs.push({ level: "info", message: "Copying fixture to temporary path." });
  await pipeline(createReadStream(sourcePath), createWriteStream(temporary, { flags: "wx" }));

  const actualHash = await sha256File(temporary);
  logs.push({ level: "info", message: "Computed SHA-256: " + actualHash });
  if (actualHash !== fixture.fileHash) {
    await rm(temporary, { force: true });
    logs.push({ level: "error", message: "Hash mismatch. Temporary file removed." });
    throw Object.assign(new Error("Hash mismatch: expected " + fixture.fileHash + " but got " + actualHash), { logs });
  }

  await rename(temporary, cachePath);
  logs.push({ level: "info", message: "Promoted temporary file to cache path." });
  return { reused: false, cachePath, actualHash, logs };
}

function safeExtension(extension: string | null): string | null {
  if (!extension) return null;
  const cleaned = extension.replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(cleaned) ? cleaned : null;
}

function corrupt(paths: { payloadPath: string; metadataPath: string }, metadata: FlowerCacheMetadata, reason: string): CacheInspection {
  return { state: "corrupt", payloadPath: paths.payloadPath, metadataPath: paths.metadataPath, metadata, reason };
}

function progress(downloadedBytes: number, totalBytes: number | undefined, startedAt: number, requestId: string | undefined, operation: string): DownloadProgress {
  const elapsedMs = Math.max(Date.now() - startedAt, 1);
  return { downloadedBytes, totalBytes, elapsedMs, bytesPerSecond: Math.round(downloadedBytes / (elapsedMs / 1000)), operation, requestId };
}

function sizeError(message: string, requestId?: string): FlowerApiError {
  return new FlowerApiError({ code: "invalid_response", message, retryable: true, operation: "download_completed", requestId });
}

async function existingValidCache(cachePath: string, expectedHash: string): Promise<boolean> {
  try {
    await stat(cachePath);
    return (await sha256File(cachePath)) === expectedHash;
  } catch {
    return false;
  }
}
