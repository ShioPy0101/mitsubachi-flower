import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const targetRoot = process.env.FLOWER_CEP_EXTENSIONS_DIR || defaultDir();
const linkPath = path.join(targetRoot, "mitsubachi-flower");
await rm(linkPath, { recursive: true, force: true });
console.log("[OK] Removed development CEP extension: " + linkPath);

function defaultDir() {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
  return path.join(os.homedir(), ".local", "share", "Adobe", "CEP", "extensions");
}
