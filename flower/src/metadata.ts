export interface FlowerMetadata {
  schema: "mitsubachi.flower/v1";
  driveItemId: string;
  organizationId: string;
  sha256: string;
  serverUpdatedAt: string;
  localCachePath: string;
  lastSyncedAt: string;
}

export interface LegacyFlowerMetadata {
  schemaVersion: 1;
  provider: "mitsubachi-flower";
  driveItemId: string;
  fileHash: string;
}

export const FLOWER_BEGIN = "[MITSUBACHI_FLOWER_BEGIN]";
export const FLOWER_END = "[MITSUBACHI_FLOWER_END]";
export const AE_COMMENT_LIMIT_BYTES = 15999;

export function createFlowerMetadata(driveItemId: string, fileHash: string): LegacyFlowerMetadata {
  return { schemaVersion: 1, provider: "mitsubachi-flower", driveItemId, fileHash };
}

export function serializeFlowerMetadata(metadata: LegacyFlowerMetadata): string {
  return JSON.stringify(metadata);
}

export function createProjectMetadata(input: Omit<FlowerMetadata, "schema" | "lastSyncedAt"> & { lastSyncedAt?: string }): FlowerMetadata {
  return { schema: "mitsubachi.flower/v1", lastSyncedAt: input.lastSyncedAt || new Date().toISOString(), driveItemId: input.driveItemId, organizationId: input.organizationId, sha256: input.sha256, serverUpdatedAt: input.serverUpdatedAt, localCachePath: input.localCachePath };
}

export function serializeProjectMetadata(metadata: FlowerMetadata): string {
  return JSON.stringify(metadata);
}

export function upsertFlowerCommentBlock(existingComment: string, metadata: FlowerMetadata): string {
  const blocks = countFlowerBlocks(existingComment);
  if (blocks > 1) throw new Error("Multiple flower metadata blocks found.");
  const block = FLOWER_BEGIN + "\n" + serializeProjectMetadata(metadata) + "\n" + FLOWER_END;
  let next: string;
  if (blocks === 1) {
    const start = existingComment.indexOf(FLOWER_BEGIN);
    const end = existingComment.indexOf(FLOWER_END) + FLOWER_END.length;
    next = existingComment.slice(0, start).replace(/[ \t]*\r?\n?$/, "") + (start > 0 ? "\n" : "") + block + existingComment.slice(end);
  } else {
    next = existingComment ? existingComment.replace(/\s*$/, "") + "\n" + block : block;
  }
  if (Buffer.byteLength(next, "utf8") > AE_COMMENT_LIMIT_BYTES) throw new Error("Flower metadata would exceed the After Effects comment limit.");
  return next;
}

export function parseFlowerCommentBlock(comment: string): FlowerMetadata | null {
  const blocks = countFlowerBlocks(comment);
  if (blocks === 0) return null;
  if (blocks > 1) throw new Error("Multiple flower metadata blocks found.");
  const start = comment.indexOf(FLOWER_BEGIN) + FLOWER_BEGIN.length;
  const end = comment.indexOf(FLOWER_END);
  const json = comment.slice(start, end).trim();
  const parsed = JSON.parse(json) as FlowerMetadata;
  if (!parsed || parsed.schema !== "mitsubachi.flower/v1" || typeof parsed.driveItemId !== "string" || typeof parsed.organizationId !== "string" || typeof parsed.sha256 !== "string" || typeof parsed.localCachePath !== "string") {
    throw new Error("Malformed flower metadata block.");
  }
  return parsed;
}

export function countFlowerBlocks(comment: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const start = comment.indexOf(FLOWER_BEGIN, offset);
    if (start < 0) break;
    const end = comment.indexOf(FLOWER_END, start + FLOWER_BEGIN.length);
    if (end < 0) throw new Error("Malformed flower metadata block.");
    count += 1;
    offset = end + FLOWER_END.length;
  }
  return count;
}
