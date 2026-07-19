import path from "node:path";
import { ensureFixtureCached, sha256File, CacheLogEntry } from "../../src/cache";
import { makeJsonCall, parseBridgeResponse } from "../../src/bridge";

declare global {
  interface Window {
    CSInterface?: new () => { evalScript(script: string, callback: (result: string) => void): void };
  }
}

type LogChannel = "ui" | "jsx" | "cache" | "error";

const logs: Record<LogChannel, string[]> = { ui: [], jsx: [], cache: [], error: [] };
let activeLog: LogChannel = "ui";
let lastImportedItemId: number | null = null;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element as T;
}

function setStatus(id: string, value: string, ok?: boolean): void {
  const element = byId<HTMLElement>(id);
  element.textContent = value;
  element.className = ok === undefined ? "" : ok ? "ok" : "error";
}

function writeResult(value: unknown): void {
  byId("result-log").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function log(channel: LogChannel, message: string): void {
  const safe = message.replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]");
  logs[channel].push(new Date().toISOString() + " " + safe);
  if (channel === activeLog) byId("active-log").textContent = logs[channel].join("\n");
}

function callAe<T>(functionName: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!window.CSInterface) {
      reject(new Error("CSInterface is not available."));
      return;
    }
    const cs = new window.CSInterface();
    const script = makeJsonCall(functionName, payload);
    log("ui", "evalScript " + functionName);
    cs.evalScript(script, (result: string) => {
      log("jsx", result);
      const parsed = parseBridgeResponse<T>(result);
      if (parsed.ok) resolve(parsed.data);
      else reject(new Error(parsed.error.code + ": " + parsed.error.message));
    });
  });
}

async function runAe<T>(functionName: string, payload?: unknown): Promise<void> {
  try {
    const data = await callAe<T>(functionName, payload);
    writeResult(data);
    if (functionName === "probe") {
      const probe = data as { aeVersion?: string; os?: string };
      setStatus("bridge-status", "OK", true);
      setStatus("ae-version", probe.aeVersion || "unknown", true);
      setStatus("os-version", probe.os || "unknown", true);
    }
    const item = data as { item?: { id?: number } };
    if (item.item && typeof item.item.id === "number") lastImportedItemId = item.item.id;
  } catch (error) {
    setStatus("bridge-status", "ERROR", false);
    log("error", error instanceof Error ? error.message : String(error));
    writeResult(error instanceof Error ? error.message : String(error));
  }
}

async function runCacheFixture(): Promise<void> {
  try {
    const root = path.resolve(__dirname, "../../../");
    const sample = path.join(root, "fixtures", "sample.txt");
    const metadataPath = path.join(root, "fixtures", "metadata.json");
    const fs = require("node:fs");
    const fixture = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    fixture.fileHash = await sha256File(sample);
    fixture.fileSize = fs.statSync(sample).size;
    const result = await ensureFixtureCached(sample, fixture, path.join(root, "cache"));
    result.logs.forEach((entry: CacheLogEntry) => log("cache", entry.level.toUpperCase() + " " + entry.message));
    writeResult(result);
  } catch (error) {
    const err = error as Error & { logs?: CacheLogEntry[] };
    if (err.logs) err.logs.forEach((entry) => log("cache", entry.level.toUpperCase() + " " + entry.message));
    log("error", err.message);
    writeResult(err.message);
  }
}

function bind(): void {
  setStatus("cep-status", window.CSInterface ? "OK" : "ERROR", Boolean(window.CSInterface));
  setStatus("os-version", (typeof process !== "undefined" && process.platform) || navigator.platform, true);
  byId("btn-probe").addEventListener("click", () => runAe("probe"));
  byId("btn-import").addEventListener("click", () => runAe("importLocalFileWithDialog"));
  byId("btn-metadata").addEventListener("click", () => runAe("writeFixtureMetadata", { itemId: lastImportedItemId }));
  byId("btn-replace").addEventListener("click", () => runAe("replaceSelectedFootageWithDialog"));
  byId("btn-add-comp").addEventListener("click", () => runAe("addSelectedFootageToActiveComp"));
  byId("btn-cache").addEventListener("click", runCacheFixture);
  Array.prototype.forEach.call(document.querySelectorAll("[data-log]"), (button: HTMLButtonElement) => {
    button.addEventListener("click", () => {
      activeLog = button.getAttribute("data-log") as LogChannel;
      Array.prototype.forEach.call(document.querySelectorAll("[data-log]"), (b: HTMLButtonElement) => b.classList.remove("active"));
      button.classList.add("active");
      byId("active-log").textContent = logs[activeLog].join("\n");
    });
  });
  log("ui", "Panel initialized.");
  runAe("probe");
}

document.addEventListener("DOMContentLoaded", bind);
