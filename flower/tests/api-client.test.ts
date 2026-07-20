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
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    await fn("http://localhost:" + (address as { port: number }).port, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function config(baseUrl: string): FlowerConfig {
  return {
    apiBaseUrl: baseUrl,
    developmentAccessToken: "dev-token",
    requestTimeoutMs: 1000,
    downloadTimeoutMs: 1000,
    maxConcurrentDownloads: 1,
    configPath: "test",
    environment: "test",
  };
}

test("FlowerApiClient sends Authorization and User-Agent and extracts request ID", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "rid-1" });
      res.end(JSON.stringify({ id: 1, display_name: "Dev", organization_id: 2, organization_name: "Org", scopes: ["flower:read"] }));
    },
    async (baseUrl, requests) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      const result = await client.me();
      assert.equal(result.requestId, "rid-1");
      assert.equal(result.data.organizationId, "2");
      assert.equal(requests[0].headers.authorization, "Bearer dev-token");
      assert.match(String(requests[0].headers["user-agent"]), /mitsubachi-flower\/0\.1\.0/);
    },
  );
});

test("FlowerApiClient maps invalid JSON and HTTP errors without leaking body", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(401, { "content-type": "application/json", "x-request-id": "rid-401" });
      res.end(JSON.stringify({ error: { code: "invalid_token", message: "The access token is invalid.", request_id: "rid-body" } }));
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      await assert.rejects(() => client.me(), /Authentication failed|access token/);
    },
  );

  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{");
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      await assert.rejects(() => client.me(), /invalid JSON/);
    },
  );
});

test("FlowerApiClient refuses cross-origin redirect", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(302, { location: "https://example.com/download?token=secret" });
      res.end();
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      await assert.rejects(() => client.downloadStream("1"), /cross-origin/);
    },
  );
});

test("FlowerApiClient supports list query and cursor parameters", async () => {
  await withServer(
    (req, res) => {
      assert.equal(req.url, "/api/v1/flower/drive_items?query=sample&cursor=abc&limit=50");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          items: [{ id: 1, name: "sample", extension: "mp4", content_type: "video/mp4", file_size: 1, file_hash: hash, updated_at: "2026-07-20T00:00:00Z" }],
          pagination: { next_cursor: null },
        }),
      );
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      const result = await client.listDriveItems({ query: "sample", cursor: "abc", limit: 50 });
      assert.equal(result.data.items[0].id, "1");
    },
  );
});

test("FlowerApiClient starts device authorization without Authorization header", async () => {
  await withServer(
    (req, res) => {
      assert.equal(req.url, "/api/v1/flower/device_authorizations");
      assert.equal(req.headers.authorization, undefined);
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        assert.deepEqual(JSON.parse(body), { client_name: "mitsubachi-flower", client_version: "0.1.0", device_name: "After Effects local" });
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "rid-device" });
        res.end(
          JSON.stringify({
            device_code: "dev",
            user_code: "ABCD-EFGH",
            verification_uri: "http://localhost:3000/flower/activate",
            verification_uri_complete: "http://localhost:3000/flower/activate?user_code=ABCD-EFGH",
            expires_in: 599,
            interval: 5,
          }),
        );
      });
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      const result = await client.startDeviceAuthorization({ clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "After Effects local" });
      assert.equal(result.data.userCode, "ABCD-EFGH");
      assert.equal(result.requestId, "rid-device");
    },
  );
});

test("FlowerApiClient polls device token with OAuth device grant", async () => {
  await withServer(
    (req, res) => {
      assert.equal(req.url, "/api/v1/flower/tokens");
      assert.equal(req.headers.authorization, undefined);
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        assert.deepEqual(JSON.parse(body), { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "dev" });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ token_type: "Bearer", access_token: "secret", expires_in: 900, scope: "flower:read flower:download", organization_id: "1" }));
      });
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(config(baseUrl), { version: "0.1.0" });
      const result = await client.pollDeviceToken("dev");
      assert.equal(result.data.tokenType, "Bearer");
      assert.equal(result.data.scope, "flower:read flower:download");
    },
  );
});

test("FlowerApiClient uses access token provider for protected requests", async () => {
  await withServer(
    (req, res) => {
      assert.equal(req.headers.authorization, "Bearer memory-token");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: 1, display_name: "Dev", organization_id: 2, organization_name: "Org", scopes: [] }));
    },
    async (baseUrl) => {
      const client = new FlowerApiClient(
        { ...config(baseUrl), developmentAccessToken: "dev-token" },
        { version: "0.1.0", accessTokenProvider: () => "memory-token" },
      );
      await client.me();
    },
  );
});
