import { mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const extensionRoot = path.resolve(".");
const targetRoot = cepExtensionsDir();
const linkPath = path.join(targetRoot, "mitsubachi-flower");

await mkdir(targetRoot, { recursive: true });
await rm(linkPath, { recursive: true, force: true });
await symlink(extensionRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
console.log("[OK] Installed development CEP extension:");
console.log(linkPath + " -> " + extensionRoot);

function cepExtensionsDir() {
  if (process.env.FLOWER_CEP_EXTENSIONS_DIR) return process.env.FLOWER_CEP_EXTENSIONS_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
  return path.join(os.homedir(), ".local", "share", "Adobe", "CEP", "extensions");
}
