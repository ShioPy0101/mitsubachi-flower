export interface FlowerMe {
  id: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  scopes: string[];
}

export interface FlowerDriveItem {
  id: string;
  name: string;
  extension: string | null;
  displayName: string;
  contentType: string;
  fileSize: number;
  sha256: string;
  updatedAt: string;
  parentId: string | null;
  organizationId?: string;
  downloadAvailable: boolean;
}

export interface FlowerDriveItemsPage {
  items: FlowerDriveItem[];
  nextCursor: string | null;
}

export interface ApiRequestResult<T> {
  data: T;
  requestId?: string;
  httpStatus: number;
}

export interface DownloadHeaders {
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  etag?: string;
  acceptRanges?: string;
  driveItemId?: string;
  sha256?: string;
  updatedAt?: string;
  requestId?: string;
}
