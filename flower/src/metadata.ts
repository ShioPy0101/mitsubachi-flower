export interface FlowerMetadata {
  schemaVersion: 1;
  provider: "mitsubachi-flower";
  driveItemId: string;
  fileHash: string;
}

export function createFlowerMetadata(driveItemId: string, fileHash: string): FlowerMetadata {
  return {
    schemaVersion: 1,
    provider: "mitsubachi-flower",
    driveItemId,
    fileHash
  };
}

export function serializeFlowerMetadata(metadata: FlowerMetadata): string {
  return JSON.stringify(metadata);
}
