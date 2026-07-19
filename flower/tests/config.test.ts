import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApiBaseUrl, parseFlowerConfig } from "../src/config";
import { redactSecrets } from "../src/redaction";

test("parseFlowerConfig accepts development config and normalizes base URL", () => {
  const config = parseFlowerConfig({ apiBaseUrl: "https://mitsubachi-api.shiosalt.com/", developmentAccessToken: "secret", requestTimeoutMs: 1000, downloadTimeoutMs: 2000, maxConcurrentDownloads: 1 }, "development.json", "development");
  assert.equal(config.apiBaseUrl, "https://mitsubachi-api.shiosalt.com");
  assert.equal(config.developmentAccessToken, "secret");
});

test("normalizeApiBaseUrl allows localhost http but rejects non-local http", () => {
  assert.equal(normalizeApiBaseUrl("http://localhost:3001/"), "http://localhost:3001");
  assert.throws(() => normalizeApiBaseUrl("http://example.com"), /HTTPS/);
});

test("production config rejects developmentAccessToken", () => {
  assert.throws(() => parseFlowerConfig({ apiBaseUrl: "https://mitsubachi-api.shiosalt.com", developmentAccessToken: "secret" }, "development.json", "production"), /disabled in production/);
});

test("redactSecrets removes tokens and authorization values", () => {
  const value = redactSecrets('Authorization: Bearer abc developmentAccessToken":"secret" https://x.test/file?token=abc&ok=1');
  assert.doesNotMatch(value, /Bearer abc/);
  assert.doesNotMatch(value, /secret/);
  assert.doesNotMatch(value, /token=abc/);
});
