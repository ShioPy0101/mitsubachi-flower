import assert from "node:assert/strict";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cachePathForHash, ensureFixtureCached, sha256File } from "../src/cache";

test("sha256File returns a sha256-prefixed digest", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "sample.txt");
  await writeFile(file, "abc");
  assert.equal(await sha256File(file), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("cachePathForHash is stable and shares cache across names with same extension", () => {
  const hash = "sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  assert.equal(cachePathForHash("/tmp/flower", hash, "a.mp4"), cachePathForHash("/tmp/flower", hash, "b.mp4"));
});

test("cachePathForHash can share content while keeping extension boundary explicit", () => {
  const hash = "sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  assert.match(cachePathForHash("/tmp/flower", hash, "日本語.mov"), /sha256\/ab\/abcdef.+\/payload\.mov$/);
});

test("ensureFixtureCached promotes a valid temporary copy and reuses existing cache", async () => {
  const dir = await tempDir();
  const source = path.join(dir, "source.txt");
  await writeFile(source, "cache me");
  const fileHash = await sha256File(source);
  const fixture = { driveItemId: "fixture-drive-item", name: "one.txt", fileHash, fileSize: 8, contentType: "text/plain" };
  const first = await ensureFixtureCached(source, fixture, path.join(dir, "cache"));
  assert.equal(first.reused, false);
  await stat(first.cachePath);
  const second = await ensureFixtureCached(source, { ...fixture, name: "two.txt" }, path.join(dir, "cache"));
  assert.equal(second.reused, true);
  assert.equal(second.cachePath, first.cachePath);
});

test("ensureFixtureCached rejects and removes hash mismatches", async () => {
  const dir = await tempDir();
  const source = path.join(dir, "source.txt");
  await writeFile(source, "bad hash");
  const fixture = {
    driveItemId: "fixture-drive-item",
    name: "source.txt",
    fileHash: "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    fileSize: 8,
    contentType: "text/plain"
  };
  await assert.rejects(() => ensureFixtureCached(source, fixture, path.join(dir, "cache")), /Hash mismatch/);
});

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), "flower-test-" + process.pid + "-" + Math.random().toString(16).slice(2));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}
