export type LogChannel = "ui" | "jsx" | "cache" | "error";

export function redactLogValue(value: string): string {
  return value
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|signature|X-Amz-Signature)=)[^&\s]+/gi, "$1[REDACTED]");
}
