export function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|access_token|refresh_token|signature|X-Amz-Signature)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:developmentAccessToken|access_token|device_code)"?\s*[:=]\s*"?)[^,"'\s}]+/gi, "$1[REDACTED]")
    .replace(/(Cookie\s*[:=]\s*)[^\n\r]+/gi, "$1[REDACTED]")
    .replace(/(Set-Cookie\s*[:=]\s*)[^\n\r]+/gi, "$1[REDACTED]")
    .replace(/(X-Accel-Redirect\s*[:=]\s*)[^\n\r]+/gi, "$1[REDACTED]");
}

export function anonymizeDiagnostics(value: string): string {
  const userProfile = process.env.USERPROFILE;
  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;
  let output = redactSecrets(value);
  for (const prefix of [localAppData, appData, userProfile]) {
    if (prefix) output = output.split(prefix).join("%USERPROFILE%" + (prefix === userProfile ? "" : prefix.slice(userProfile?.length || 0)));
  }
  return output;
}
