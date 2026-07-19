import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeDiagnostics, redactSecrets } from "../src/redaction";
import { createProjectMetadata, parseFlowerCommentBlock, upsertFlowerCommentBlock } from "../src/metadata";

const metadata = createProjectMetadata({ driveItemId: "123", organizationId: "456", sha256: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", serverUpdatedAt: "2026-07-20T00:00:00Z", localCachePath: String.raw`C:\Users\taku2\AppData\Local\Mitsubachi\Flower\cache\payload.mp4`, lastSyncedAt: "2026-07-20T12:00:00Z" });

test("flower comment block preserves existing comment and parses metadata", () => {
  const comment = upsertFlowerCommentBlock("human note", metadata);
  assert.match(comment, /^human note/);
  assert.deepEqual(parseFlowerCommentBlock(comment), metadata);
});

test("flower comment block replaces existing block", () => {
  const first = upsertFlowerCommentBlock("note", metadata);
  const next = upsertFlowerCommentBlock(first, { ...metadata, driveItemId: "999" });
  assert.equal(parseFlowerCommentBlock(next)?.driveItemId, "999");
  assert.equal((next.match(/MITSUBACHI_FLOWER_BEGIN/g) || []).length, 1);
});

test("flower comment block rejects duplicate and malformed blocks", () => {
  const first = upsertFlowerCommentBlock("", metadata);
  assert.throws(() => parseFlowerCommentBlock(first + "\n" + first), /Multiple/);
  assert.throws(() => parseFlowerCommentBlock("[MITSUBACHI_FLOWER_BEGIN]\n{}"), /Malformed/);
});

test("flower comment block enforces comment size limit", () => {
  assert.throws(() => upsertFlowerCommentBlock("x".repeat(16000), metadata), /limit/);
});

test("diagnostics redacts secrets and keeps request IDs", () => {
  const redacted = anonymizeDiagnostics('Authorization: Bearer secret requestId=abc C:\\Users\\taku2\\AppData\\Local\\Mitsubachi\\Flower\\cache\\x?token=secret');
  assert.doesNotMatch(redacted, /Bearer secret/);
  assert.doesNotMatch(redacted, /token=secret/);
  assert.match(redacted, /requestId=abc/);
});

test("redactSecrets removes Set-Cookie and X-Accel-Redirect", () => {
  const redacted = redactSecrets("Set-Cookie: session=secret\nX-Accel-Redirect: /internal/path");
  assert.doesNotMatch(redacted, /session=secret/);
  assert.doesNotMatch(redacted, /internal\/path/);
});
