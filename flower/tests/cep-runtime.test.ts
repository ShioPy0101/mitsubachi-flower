import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("built CEP panel does not use node: core module specifiers", async () => {
  const mainJs = await readFile(path.join(process.cwd(), "build", "panel", "src", "main.js"), "utf8");
  assert.equal(mainJs.includes('require("node:'), false);
  assert.equal(mainJs.includes("require('node:"), false);
});
