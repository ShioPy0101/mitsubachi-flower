import assert from "node:assert/strict";
import test from "node:test";
import { makeJsonCall, parseBridgeResponse, quoteForExtendScript } from "../src/bridge";
import { createFlowerMetadata, serializeFlowerMetadata } from "../src/metadata";

test("quoteForExtendScript safely escapes paths and structured string values", () => {
  const values = [
    String.raw`C:\Users\花子\file "quoted".mp4`,
    "/Users/hanako/素材/file 'single'.mov",
    "line1\nline2\\tail"
  ];
  for (const value of values) {
    assert.equal(JSON.parse(quoteForExtendScript(value)), value);
  }
});

test("makeJsonCall embeds JSON payload as one ExtendScript string argument", () => {
  const call = makeJsonCall("probePath", { path: String.raw`C:\素材\movie.mp4`, note: "日本語\nquote\"" });
  assert.match(call, /^flower\.probePath\("/);
  const argument = call.replace(/^flower\.probePath\(/, "").replace(/\)$/, "");
  assert.deepEqual(JSON.parse(JSON.parse(argument)), { path: String.raw`C:\素材\movie.mp4`, note: "日本語\nquote\"" });
});

test("parseBridgeResponse accepts ok and error JSON", () => {
  assert.deepEqual(parseBridgeResponse('{"ok":true,"data":{"itemCount":2}}'), { ok: true, data: { itemCount: 2 } });
  assert.deepEqual(parseBridgeResponse('{"ok":false,"error":{"code":"FLOWER_AE_ERROR","message":"x"}}'), {
    ok: false,
    error: { code: "FLOWER_AE_ERROR", message: "x" }
  });
});

test("parseBridgeResponse reports invalid JSON", () => {
  const result = parseBridgeResponse("EvalScript error");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FLOWER_BRIDGE_PARSE_ERROR");
});

test("metadata JSON generation is stable", () => {
  assert.equal(
    serializeFlowerMetadata(createFlowerMetadata("fixture-drive-item", "sha256:fixture")),
    '{"schemaVersion":1,"provider":"mitsubachi-flower","driveItemId":"fixture-drive-item","fileHash":"sha256:fixture"}'
  );
});
