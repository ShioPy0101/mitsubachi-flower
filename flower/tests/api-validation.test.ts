import assert from "node:assert/strict";
import test from "node:test";
import { validateDriveItem, validateDriveItemsPage, validateFlowerMe } from "../src/api/validation";

const hash = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

test("validateFlowerMe maps Rails user fields", () => {
  assert.deepEqual(validateFlowerMe({ id: 1, display_name: "A", organization_id: 2, organization_name: "Org", scopes: ["flower:read"] }), { id: "1", displayName: "A", organizationId: "2", organizationName: "Org", scopes: ["flower:read"] });
});

test("validateDriveItem accepts Rails file_hash and builds display name", () => {
  const item = validateDriveItem({ id: 123, name: "sample", extension: "mp4", content_type: "video/mp4", file_size: 10, file_hash: hash, updated_at: "2026-07-20T00:00:00Z", parent_id: null });
  assert.equal(item.id, "123");
  assert.equal(item.displayName, "sample.mp4");
  assert.equal(item.sha256, hash);
});

test("validateDriveItem rejects invalid hash and negative size", () => {
  assert.throws(() => validateDriveItem({ id: 1, name: "bad", extension: "mp4", content_type: "video/mp4", file_size: -1, file_hash: hash, updated_at: "x" }), /file size/);
  assert.throws(() => validateDriveItem({ id: 1, name: "bad", extension: "mp4", content_type: "video/mp4", file_size: 1, file_hash: "sha256:ABC", updated_at: "x" }), /SHA-256/);
});

test("validateDriveItemsPage reads items and next_cursor", () => {
  const page = validateDriveItemsPage({ items: [{ id: 1, name: "image", extension: "png", content_type: "image/png", file_size: 1, file_hash: hash, updated_at: "2026-07-20T00:00:00Z" }], pagination: { next_cursor: "n" }, ignored: true });
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, "n");
});
