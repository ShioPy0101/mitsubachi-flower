import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("built CEP panel does not use node: core module specifiers", async () => {
  const mainJs = await readFile(path.join(process.cwd(), "build", "panel", "src", "main.js"), "utf8");
  assert.equal(mainJs.includes('require("node:'), false);
  assert.equal(mainJs.includes("require('node:"), false);
});

test("CEP panel bootstraps main script from extension absolute path", async () => {
  const indexHtml = await readFile(path.join(process.cwd(), "panel", "index.html"), "utf8");
  assert.equal(indexHtml.includes("require(\"../build/panel/src/main.js\")"), false);
  assert.equal(indexHtml.includes("bootstrapFlowerPanel"), true);
  assert.equal(indexHtml.includes("path.join(extensionRoot, \"build\", \"panel\", \"src\", \"main.js\")"), true);
  assert.equal(indexHtml.includes("flower panel bootstrap failed"), true);
});

test("build output includes package metadata required by CEP panel", async () => {
  const buildPackageJson = JSON.parse(await readFile(path.join(process.cwd(), "build", "package.json"), "utf8"));
  assert.equal(buildPackageJson.version, "0.1.0");
  assert.equal(buildPackageJson.type, "commonjs");
});

test("CSInterface shim delegates evalScript to Adobe CEP runtime", async () => {
  const shim = await readFile(path.join(process.cwd(), "panel", "lib", "CSInterface.js"), "utf8");
  assert.equal(shim.includes("window.__adobe_cep__.evalScript(script, callback)"), true);
  assert.equal(shim.includes("CSInterface stub is loaded"), false);
});

test("ExtendScript bridge guards optional AVItem global", async () => {
  const jsx = await readFile(path.join(process.cwd(), "jsx", "flower.jsx"), "utf8");
  assert.equal(jsx.includes("typeof AVItem !== \"undefined\" && item instanceof AVItem"), true);
  assert.equal(jsx.includes("if (item instanceof AVItem)"), false);
});

test("CEP runtime code avoids older Node incompatible APIs", async () => {
  const apiClient = await readFile(path.join(process.cwd(), "src", "api", "client.ts"), "utf8");
  const deviceFlow = await readFile(path.join(process.cwd(), "src", "auth", "deviceFlow.ts"), "utf8");
  const cache = await readFile(path.join(process.cwd(), "src", "cache.ts"), "utf8");
  assert.equal(apiClient.includes("{ once: true }"), false);
  assert.equal(deviceFlow.includes("{ once: true }"), false);
  assert.equal(cache.includes("{ once: true }"), false);
  assert.equal(apiClient.includes("transport.request(url,"), false);
  assert.equal(apiClient.includes("transport.request(requestOptions,"), true);
});
