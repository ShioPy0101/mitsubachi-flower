import { spawnSync } from "node:child_process";

const tsc = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(tsc, ["-p", "tsconfig.json"], { stdio: "inherit", shell: process.platform === "win32" });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log("[OK] TypeScript build completed.");
