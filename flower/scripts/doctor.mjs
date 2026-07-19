import { access, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let errors = 0;
const root = path.resolve(".");

function ok(message) {
  console.log("[OK] " + message);
}
function warn(message) {
  console.log("[WARN] " + message);
}
function error(message) {
  errors += 1;
  console.log("[ERROR] " + message);
}

ok("Node.js " + process.version);
if (Number(process.versions.node.split(".")[0]) < 20) warn("Node.js 20 or newer is recommended for this harness.");
await checkPath("node_modules", "dependencies installed", "dependencies are not installed. Run npm install.");
await checkPath("build/panel/src/main.js", "build output found", "build output missing. Run npm run build.");
await checkPath("manifest/CSXS/manifest.xml", "CEP manifest found", "CEP manifest missing.");
await checkPath("jsx/flower.jsx", "ExtendScript bridge found", "jsx/flower.jsx missing.");
await checkPath("fixtures/sample.txt", "fixture sample found", "fixture sample missing.");
await checkPath("fixtures/metadata.json", "fixture metadata found", "fixture metadata missing.");

const cepDir = cepExtensionsDir();
console.log("[INFO] CEP extension target: " + cepDir);
if (existsSync(cepDir)) ok("CEP extension target exists");
else warn("CEP extension target does not exist yet. install:dev will create it.");

await checkCacheWritable();
checkDebugMode();
detectAfterEffects();

process.exitCode = errors ? 1 : 0;

async function checkPath(relative, okMessage, errorMessage) {
  try {
    await access(path.join(root, relative));
    ok(okMessage);
  } catch {
    error(errorMessage);
  }
}

async function checkCacheWritable() {
  const cacheDir = path.join(root, "cache", "doctor");
  const probe = path.join(cacheDir, "write-test.txt");
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    ok("cache directory is writable");
  } catch (err) {
    error("cache directory is not writable: " + err.message);
  }
}

function checkDebugMode() {
  if (process.env.FLOWER_ASSUME_CEP_DEBUG === "1") {
    ok("CEP debug mode marked enabled by FLOWER_ASSUME_CEP_DEBUG=1");
    return;
  }
  if (process.platform === "darwin") {
    warn("CEP debug mode must be checked with: defaults read com.adobe.CSXS.11 PlayerDebugMode");
  } else if (process.platform === "win32") {
    warn("CEP debug mode must be checked in HKCU\\Software\\Adobe\\CSXS.11 PlayerDebugMode");
  } else {
    warn("CEP debug mode cannot be checked on this OS.");
  }
}

function detectAfterEffects() {
  if (process.platform === "darwin" && existsSync("/Applications/Adobe After Effects 2025/Adobe After Effects 2025.app")) {
    ok("After Effects installation candidate found");
  } else if (process.platform === "win32" && process.env.ProgramFiles && existsSync(path.join(process.env.ProgramFiles, "Adobe"))) {
    warn("Adobe directory found; confirm After Effects version manually.");
  } else {
    warn("After Effects installation could not be detected. Confirm manually.");
  }
}

function cepExtensionsDir() {
  if (process.env.FLOWER_CEP_EXTENSIONS_DIR) return process.env.FLOWER_CEP_EXTENSIONS_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
  return path.join(os.homedir(), ".local", "share", "Adobe", "CEP", "extensions");
}
