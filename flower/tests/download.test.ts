import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commitDownloadedStream, inspectCache, readCacheMetadata, retryFs, sha256File } from "../src/cache";

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), "flower-download-test-" + process.pid + "-" + Math.random().toString(16).slice(2));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

test("commitDownloadedStream writes payload and metadata atomically", async () => {
  const dir = await tempDir();
  const payload = Buffer.from("download me");
  const hash = "sha256:" + (await hashBuffer(payload));
  const item = { id: "123", name: "sample", extension: "txt", displayName: "sample.txt", contentType: "video/mp4", fileSize: payload.length, sha256: hash, updatedAt: "2026-07-20T00:00:00Z", parentId: null, downloadAvailable: true };
  const result = await commitDownloadedStream({ item, organizationId: "456", stream: Readable.from([payload]), headers: { contentLength: payload.length, sha256: hash, driveItemId: "123", requestId: "rid" }, cacheRoot: dir });
  assert.equal(result.actualSha256, hash);
  assert.equal((await stat(result.cachePath)).size, payload.length);
  const metadata = await readCacheMetadata(result.metadataPath);
  assert.equal(metadata.organizationId, "456");
  assert.equal(metadata.driveItemId, "123");
  assert.equal(metadata.sha256, hash);
  assert.doesNotMatch(await readFile(result.metadataPath, "utf8"), /token|Authorization/i);
});

test("commitDownloadedStream rejects hash mismatch and removes temporary files", async () => {
  const dir = await tempDir();
  const item = { id: "123", name: "sample", extension: "txt", displayName: "sample.txt", contentType: "video/mp4", fileSize: 3, sha256: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", updatedAt: "2026-07-20T00:00:00Z", parentId: null, downloadAvailable: true };
  await assert.rejects(() => commitDownloadedStream({ item, organizationId: "456", stream: Readable.from([Buffer.from("bad")]), headers: { contentLength: 3, requestId: "rid" }, cacheRoot: dir }), /SHA-256/);
  const inspected = await inspectCache(dir, item, "456");
  assert.notEqual(inspected.state, "cached");
});

test("commitDownloadedStream rejects content length mismatch", async () => {
  const dir = await tempDir();
  const payload = Buffer.from("abc");
  const hash = "sha256:" + (await hashBuffer(payload));
  const item = { id: "123", name: "sample", extension: "txt", displayName: "sample.txt", contentType: "video/mp4", fileSize: payload.length, sha256: hash, updatedAt: "2026-07-20T00:00:00Z", parentId: null, downloadAvailable: true };
  await assert.rejects(() => commitDownloadedStream({ item, organizationId: "456", stream: Readable.from([payload]), headers: { contentLength: 99 }, cacheRoot: dir }), /Content-Length/);
});

test("inspectCache detects corrupt metadata and cache hit avoids redownload", async () => {
  const dir = await tempDir();
  const payload = Buffer.from("abc");
  const hash = "sha256:" + (await hashBuffer(payload));
  const item = { id: "123", name: "sample", extension: "txt", displayName: "sample.txt", contentType: "video/mp4", fileSize: payload.length, sha256: hash, updatedAt: "2026-07-20T00:00:00Z", parentId: null, downloadAvailable: true };
  const first = await commitDownloadedStream({ item, organizationId: "456", stream: Readable.from([payload]), headers: { contentLength: payload.length }, cacheRoot: dir });
  const second = await commitDownloadedStream({ item, organizationId: "456", stream: Readable.from([Buffer.from("ignored")]), headers: { contentLength: 7 }, cacheRoot: dir });
  assert.equal(second.reused, true);
  await writeFile(first.metadataPath, "{", "utf8");
  const inspected = await inspectCache(dir, item, "456");
  assert.equal(inspected.state, "corrupt");
});

test("retryFs retries transient Windows lock errors", async () => {
  let attempts = 0;
  const result = await retryFs(async () => {
    attempts += 1;
    if (attempts < 2) throw Object.assign(new Error("locked"), { code: "EPERM" });
    return "ok";
  });
  assert.equal(result, "ok");
});

async function hashBuffer(buffer: Buffer): Promise<string> {
  const dir = await tempDir();
  const file = path.join(dir, "payload.bin");
  await writeFile(file, buffer);
  return (await sha256File(file)).slice("sha256:".length);
}
