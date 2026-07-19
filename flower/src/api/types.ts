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

export interface FlowerDeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export interface FlowerTokenResponse {
  tokenType: "Bearer";
  accessToken: string;
  expiresIn: number;
  scope: string;
  organizationId: string;
}

export type FlowerDeviceTokenErrorCode =
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token"
  | "invalid_grant"
  | "invalid_request";

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
