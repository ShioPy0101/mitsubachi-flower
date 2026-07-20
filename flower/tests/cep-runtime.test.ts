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
