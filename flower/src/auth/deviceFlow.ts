import { FlowerApiError } from "../api/errors";
import { FlowerApiClient } from "../api/client";
import { FlowerDeviceAuthorization, FlowerTokenResponse } from "../api/types";

export type AuthenticationState =
  | { status: "signed_out" }
  | { status: "authorizing"; userCode: string; verificationUri: string; verificationUriComplete?: string; expiresAt: number }
  | { status: "signed_in" }
  | { status: "error"; message: string };

export interface DeviceAuthorizationStartInput {
  clientName: string;
  clientVersion: string;
  deviceName: string;
}

export interface DeviceAuthorizationPollOptions {
  client: Pick<FlowerApiClient, "startDeviceAuthorization" | "pollDeviceToken">;
  input: DeviceAuthorizationStartInput;
  signal?: AbortSignal;
  now?: () => number;
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onState?: (state: AuthenticationState) => void;
  onSlowDown?: (intervalSeconds: number) => void;
}

export interface DeviceAuthorizationPollResult {
  authorization: FlowerDeviceAuthorization;
  token: FlowerTokenResponse;
  pollCount: number;
}

export const SLOW_DOWN_INCREMENT_SECONDS = 5;

const STOP_CODES = new Set(["access_denied", "expired_token", "invalid_grant", "invalid_request"]);

export async function runDeviceAuthorizationFlow(options: DeviceAuthorizationPollOptions): Promise<DeviceAuthorizationPollResult> {
  const now = options.now || Date.now;
  const delay = options.delay || defaultDelay;
  const authorization = (await options.client.startDeviceAuthorization(options.input, options.signal)).data;
  const expiresAt = now() + authorization.expiresIn * 1000;
  options.onState?.({ status: "authorizing", userCode: authorization.userCode, verificationUri: authorization.verificationUri, verificationUriComplete: authorization.verificationUriComplete, expiresAt });
  let intervalSeconds = Math.max(authorization.interval, 1);
  let pollCount = 0;

  while (true) {
    if (options.signal?.aborted) throw cancelled();
    if (now() >= expiresAt) throw new FlowerApiError({ code: "timeout", message: "Device authorization expired.", retryable: false, operation: "device_token_poll" });
    await delay(intervalSeconds * 1000, options.signal);
    if (options.signal?.aborted) throw cancelled();
    if (now() >= expiresAt) throw new FlowerApiError({ code: "timeout", message: "Device authorization expired.", retryable: false, operation: "device_token_poll" });
    pollCount += 1;
    try {
      const token = (await options.client.pollDeviceToken(authorization.deviceCode, options.signal)).data;
      options.onState?.({ status: "signed_in" });
      return { authorization, token, pollCount };
    } catch (error) {
      if (!(error instanceof FlowerApiError)) throw error;
      const serverCode = error.details.serverCode;
      if (serverCode === "authorization_pending") continue;
      if (serverCode === "slow_down") {
        intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
        options.onSlowDown?.(intervalSeconds);
        continue;
      }
      if (serverCode && STOP_CODES.has(serverCode)) {
        throw new FlowerApiError({ ...error.details, retryable: false, message: userMessageForDeviceError(serverCode) });
      }
      throw error;
    }
  }
}

export function userMessageForDeviceError(code: string): string {
  switch (code) {
    case "access_denied":
      return "Sign in was denied.";
    case "expired_token":
      return "Sign in expired. Start again.";
    case "invalid_grant":
      return "Sign in session is no longer valid. Start again.";
    case "invalid_request":
      return "Sign in request was invalid. Start again.";
    default:
      return "Sign in failed.";
  }
}

function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(cancelled());
        return;
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(cancelled());
      }, { once: true });
    }
  });
}

function cancelled(): FlowerApiError {
  return new FlowerApiError({ code: "cancelled", message: "Sign in was cancelled.", retryable: true, operation: "device_token_poll" });
}
