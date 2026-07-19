export interface BridgeError {
  code: string;
  message: string;
}

export type BridgeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeError };

export function parseBridgeResponse<T>(value: string): BridgeResponse<T> {
  try {
    var parsed = JSON.parse(value) as BridgeResponse<T>;
    if (parsed && typeof parsed === "object" && typeof parsed.ok === "boolean") {
      return parsed;
    }
    return bridgeError("FLOWER_BRIDGE_INVALID_RESPONSE", "ExtendScript returned JSON without an ok flag.");
  } catch (error) {
    return bridgeError("FLOWER_BRIDGE_PARSE_ERROR", error instanceof Error ? error.message : String(error));
  }
}

export function bridgeError(code: string, message: string): BridgeResponse<never> {
  return { ok: false, error: { code, message } };
}

export function quoteForExtendScript(value: string): string {
  return JSON.stringify(value);
}

export function makeJsonCall(functionName: string, payload: unknown): string {
  return "flower." + functionName + "(" + quoteForExtendScript(JSON.stringify(payload)) + ")";
}
