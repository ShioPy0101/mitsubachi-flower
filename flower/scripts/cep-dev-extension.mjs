import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXTENSION_NAME = "mitsubachi-flower";

export function cepExtensionsDir() {
  if (process.env.FLOWER_CEP_EXTENSIONS_DIR) return process.env.FLOWER_CEP_EXTENSIONS_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
  return path.join(os.homedir(), ".local", "share", "Adobe", "CEP", "extensions");
}

export function extensionLinkPath(targetRoot = cepExtensionsDir()) {
  return path.join(targetRoot, EXTENSION_NAME);
}

export async function installDevelopmentExtension({ extensionRoot = path.resolve("."), targetRoot = cepExtensionsDir(), logger = console } = {}) {
  const resolvedExtensionRoot = path.resolve(extensionRoot);
  const linkPath = extensionLinkPath(targetRoot);
  await validateExtensionRoot(resolvedExtensionRoot);
  await mkdir(targetRoot, { recursive: true });
  await removeExistingLink(linkPath);
  await symlink(resolvedExtensionRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
  const validation = await validateExtensionRoot(linkPath);
  logger.log("[OK] Installed development CEP extension:");
  logger.log("extension root: " + linkPath);
  logger.log("junction target: " + resolvedExtensionRoot);
  logger.log("manifest path: " + validation.manifestPath);
  logger.log("MainPath resolved: " + validation.mainPathResolved);
  logger.log("ScriptPath resolved: " + validation.scriptPathResolved);
  return { extensionRoot: linkPath, junctionTarget: resolvedExtensionRoot, ...validation };
}

export async function removeExistingLink(linkPath) {
  let stats;
  try {
    stats = await lstat(linkPath);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  if (!stats.isSymbolicLink()) {
    throw new Error("Refusing to remove non-link path: " + linkPath);
  }
  await rm(linkPath, { recursive: false, force: true });
}

export async function validateExtensionRoot(extensionRoot) {
  const manifestPath = path.join(extensionRoot, "CSXS", "manifest.xml");
  if (!existsSync(manifestPath)) throw new Error("CEP manifest missing: " + manifestPath);
  const xml = await readFile(manifestPath, "utf8");
  const mainPath = readXmlTag(xml, "MainPath");
  const scriptPath = readXmlTag(xml, "ScriptPath");
  if (!mainPath) throw new Error("CEP manifest MainPath is missing: " + manifestPath);
  if (!scriptPath) throw new Error("CEP manifest ScriptPath is missing: " + manifestPath);
  const mainPathResolved = path.resolve(extensionRoot, mainPath);
  const scriptPathResolved = path.resolve(extensionRoot, scriptPath);
  if (!existsSync(mainPathResolved)) throw new Error("CEP MainPath target missing: " + mainPathResolved);
  if (!existsSync(scriptPathResolved)) throw new Error("CEP ScriptPath target missing: " + scriptPathResolved);
  return { manifestPath, mainPath, scriptPath, mainPathResolved, scriptPathResolved };
}

function readXmlTag(xml, tagName) {
  const match = xml.match(new RegExp("<" + tagName + ">\\s*([^<]+?)\\s*</" + tagName + ">"));
  return match ? match[1].trim() : null;
}
