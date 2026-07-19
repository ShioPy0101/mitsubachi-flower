import { FlowerApiError } from "./errors";
import { FlowerDriveItem, FlowerDriveItemsPage, FlowerMe } from "./types";

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

export function assertSha256(value: unknown, operation: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new FlowerApiError({ code: "invalid_response", message: "API returned an invalid SHA-256 value.", retryable: false, operation });
  }
  return value;
}

function stringValue(value: unknown, field: string, operation: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FlowerApiError({ code: "invalid_response", message: "API response is missing " + field + ".", retryable: false, operation });
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberId(value: unknown, field: string, operation: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  throw new FlowerApiError({ code: "invalid_response", message: "API response has an invalid " + field + ".", retryable: false, operation });
}

function nonNegativeSize(value: unknown, operation: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new FlowerApiError({ code: "invalid_response", message: "API response has an invalid file size.", retryable: false, operation });
}

export function validateFlowerMe(raw: unknown): FlowerMe {
  const operation = "api_me";
  const source = unwrapData(raw);
  if (!source || typeof source !== "object") throw invalid(operation, "API returned an invalid me response.");
  const record = source as Record<string, unknown>;
  return {
    id: numberId(record.id, "id", operation),
    displayName: optionalString(record.display_name) || optionalString(record.name) || "unknown",
    organizationId: numberId(record.organization_id, "organization_id", operation),
    organizationName: optionalString(record.organization_name) || "unknown",
    scopes: Array.isArray(record.scopes) ? record.scopes.filter((scope): scope is string => typeof scope === "string") : []
  };
}

export function validateDriveItem(raw: unknown, operation = "drive_item"): FlowerDriveItem {
  const source = unwrapData(raw);
  if (!source || typeof source !== "object") throw invalid(operation, "API returned an invalid drive item.");
  const record = source as Record<string, unknown>;
  const id = numberId(record.id, "id", operation);
  const name = stringValue(record.name, "name", operation);
  const extension = optionalString(record.extension);
  const displayName = optionalString(record.display_name) || (extension ? name + "." + extension : name);
  const contentType = stringValue(record.content_type, "content_type", operation);
  if (!/^(image|video)\//.test(contentType)) throw invalid(operation, "API returned a non image/video drive item.");
  const hash = assertSha256(record.sha256 || record.file_hash, operation);
  const fileSize = nonNegativeSize(record.file_size, operation);
  const updatedAt = stringValue(record.updated_at, "updated_at", operation);
  return {
    id,
    name,
    extension,
    displayName,
    contentType,
    fileSize,
    sha256: hash,
    updatedAt,
    parentId: record.parent_id == null ? null : numberId(record.parent_id, "parent_id", operation),
    organizationId: record.organization_id == null ? undefined : numberId(record.organization_id, "organization_id", operation),
    downloadAvailable: record.download_available === undefined ? true : record.download_available === true
  };
}

export function validateDriveItemsPage(raw: unknown): FlowerDriveItemsPage {
  const operation = "drive_items_list";
  if (!raw || typeof raw !== "object") throw invalid(operation, "API returned an invalid drive item list.");
  const record = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(record.items) ? record.items : Array.isArray(record.data) ? record.data : null;
  if (!itemsRaw) throw invalid(operation, "API response is missing items.");
  const pagination = record.pagination && typeof record.pagination === "object" ? (record.pagination as Record<string, unknown>) : null;
  const meta = record.meta && typeof record.meta === "object" ? (record.meta as Record<string, unknown>) : null;
  const nextCursor = optionalString(pagination?.next_cursor) || optionalString(meta?.next_cursor);
  return { items: itemsRaw.map((item) => validateDriveItem(item, operation)), nextCursor };
}

function unwrapData(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in raw && Object.keys(raw as Record<string, unknown>).length <= 2) {
    return (raw as Record<string, unknown>).data;
  }
  return raw;
}

function invalid(operation: string, message: string): FlowerApiError {
  return new FlowerApiError({ code: "invalid_response", message, retryable: false, operation });
}
