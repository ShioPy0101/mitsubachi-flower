import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { FlowerApiClient } from "../src/api/client";
import { FlowerConfig } from "../src/config";

const hash = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

async function withServer(handler: http.RequestListener, fn: (baseUrl: string, requests: http.IncomingMessage[]) => Promise<void>): Promise<void> {
  const requests: http.IncomingMessage[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    await fn("http://127.0.0.1:" + (address as { port: number }).port, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function config(baseUrl: string): FlowerConfig {
  return { apiBaseUrl: baseUrl, developmentAccessToken: "dev-token", requestTimeoutMs: 1000, downloadTimeoutMs: 1000, maxConcurrentDownloads: 1, configPath: "test", environment: "test" };
}

test("FlowerApiClient sends Authorization and User-Agent and extracts request ID", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "rid-1" });
    res.end(JSON.stringify({ id: 1, display_name: "Dev", organization_id: 2, organization_name: "Org", scopes: ["flower:read"] }));
  }, async (baseUrl, requests) => {
    const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
    const result = await client.me();
    assert.equal(result.requestId, "rid-1");
    assert.equal(result.data.organizationId, "2");
    assert.equal(requests[0].headers.authorization, "Bearer dev-token");
    assert.match(String(requests[0].headers["user-agent"]), /mitsubachi-flower\/0\.1\.0/);
  });
});

test("FlowerApiClient maps invalid JSON and HTTP errors without leaking body", async () => {
  await withServer((_req, res) => {
    res.writeHead(401, { "content-type": "application/json", "x-request-id": "rid-401" });
    res.end(JSON.stringify({ error: { code: "invalid_token", message: "The access token is invalid.", request_id: "rid-body" } }));
  }, async (baseUrl) => {
    const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
    await assert.rejects(() => client.me(), /Authentication failed|access token/);
  });

  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{");
  }, async (baseUrl) => {
    const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
    await assert.rejects(() => client.me(), /invalid JSON/);
  });
});

test("FlowerApiClient refuses cross-origin redirect", async () => {
  await withServer((_req, res) => {
    res.writeHead(302, { location: "https://example.com/download?token=secret" });
    res.end();
  }, async (baseUrl) => {
    const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
    await assert.rejects(() => client.downloadStream("1"), /cross-origin/);
  });
});

test("FlowerApiClient supports list query and cursor parameters", async () => {
  await withServer((req, res) => {
    assert.equal(req.url, "/api/v1/flower/drive_items?query=sample&cursor=abc&limit=50");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ items: [{ id: 1, name: "sample", extension: "mp4", content_type: "video/mp4", file_size: 1, file_hash: hash, updated_at: "2026-07-20T00:00:00Z" }], pagination: { next_cursor: null } }));
  }, async (baseUrl) => {
    const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
    const result = await client.listDriveItems({ query: "sample", cursor: "abc", limit: 50 });
    assert.equal(result.data.items[0].id, "1");
  });
});
