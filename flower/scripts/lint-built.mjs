import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";

const files = globSync("{src,panel/src,tests}/**/*.ts");
let failed = false;
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (/\bconsole\.log\b/.test(text)) {
    console.error("[ERROR] console.log found in " + file);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("[OK] lint checks passed.");
