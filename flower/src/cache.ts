import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

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

export function cachePathForHash(cacheRoot: string, fileHash: string, fileName: string): string {
  const hex = normalizeSha256(fileHash);
  const extension = path.extname(fileName) || ".bin";
  return path.join(cacheRoot, "sha256", hex.slice(0, 2), hex, "payload" + extension);
}

export function tempPathFor(cachePath: string): string {
  return cachePath + ".tmp-" + process.pid + "-" + Date.now();
}

export async function ensureFixtureCached(
  sourcePath: string,
  fixture: CacheFixture,
  cacheRoot: string
): Promise<CacheResult> {
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
    throw Object.assign(new Error("Hash mismatch: expected " + fixture.fileHash + " but got " + actualHash), {
      logs
    });
  }

  await rename(temporary, cachePath);
  logs.push({ level: "info", message: "Promoted temporary file to cache path." });
  return { reused: false, cachePath, actualHash, logs };
}

async function existingValidCache(cachePath: string, expectedHash: string): Promise<boolean> {
  try {
    await stat(cachePath);
    return (await sha256File(cachePath)) === expectedHash;
  } catch {
    return false;
  }
}
