import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const tsc = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(tsc, ["-p", "tsconfig.json"], { stdio: "inherit", shell: process.platform === "win32" });
if (result.status !== 0) process.exit(result.status ?? 1);

await writeBuildPackageJson();

console.log("[OK] TypeScript build completed.");

async function writeBuildPackageJson() {
  const packageJsonPath = path.resolve("package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const buildPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    type: "commonjs"
  };
  await mkdir(path.resolve("build"), { recursive: true });
  await writeFile(path.resolve("build", "package.json"), JSON.stringify(buildPackageJson, null, 2) + "\n", "utf8");
}
