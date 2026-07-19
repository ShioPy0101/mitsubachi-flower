export type FlowerApiErrorCode =
  | "config_error"
  | "network_error"
  | "timeout"
  | "tls_error"
  | "invalid_response"
  | "invalid_json"
  | "unauthorized"
  | "forbidden"
  | "insufficient_scope"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server_error"
  | "cancelled"
  | "hash_mismatch"
  | "disk_error"
  | "ae_import_error";

export interface FlowerApiErrorDetails {
  code: FlowerApiErrorCode;
  message: string;
  httpStatus?: number;
  requestId?: string;
  retryable: boolean;
  operation: string;
  causeName?: string;
}

export class FlowerApiError extends Error {
  readonly details: FlowerApiErrorDetails;

  constructor(details: FlowerApiErrorDetails) {
    super(details.message);
    this.name = "FlowerApiError";
    this.details = details;
  }
}

export function toFlowerError(error: unknown, operation: string): FlowerApiError {
  if (error instanceof FlowerApiError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new FlowerApiError({ code: "cancelled", message: "Operation was cancelled.", retryable: true, operation, causeName: error.name });
  }
  if (error instanceof Error) {
    const code = /CERT|TLS|SSL/i.test(error.message) ? "tls_error" : "network_error";
    return new FlowerApiError({ code, message: code === "tls_error" ? "TLS connection failed." : "Network request failed.", retryable: true, operation, causeName: error.name });
  }
  return new FlowerApiError({ code: "network_error", message: "Network request failed.", retryable: true, operation });
}

export function httpStatusToCode(status: number, serverCode?: string): FlowerApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return serverCode === "insufficient_scope" ? "insufficient_scope" : "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "invalid_response";
}
