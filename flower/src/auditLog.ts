import { appendFile, mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { redactSecrets } from "./redaction";

export type AuditLevel = "debug" | "info" | "warn" | "error";

export interface AuditLogEntry {
  timestamp?: string;
  level: AuditLevel;
  flowerVersion: string;
  operation: string;
  result?: "success" | "failure" | "cancelled";
  durationMs?: number;
  requestId?: string;
  httpStatus?: number;
  driveItemId?: string;
  organizationId?: string;
  expectedBytes?: number;
  actualBytes?: number;
  expectedSha256?: string;
  actualSha256?: string;
  errorCategory?: string | null;
  message: string;
}

export function flowerLogDir(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Mitsubachi", "Flower", "logs");
}

export function flowerLogPath(date = new Date()): string {
  return path.join(flowerLogDir(), "flower-" + date.toISOString().slice(0, 10) + ".jsonl");
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await mkdir(flowerLogDir(), { recursive: true });
  const safe = JSON.parse(redactSecrets(JSON.stringify({ ...entry, timestamp: entry.timestamp || new Date().toISOString() })));
  await appendFile(flowerLogPath(), JSON.stringify(safe) + "\n", "utf8");
}
