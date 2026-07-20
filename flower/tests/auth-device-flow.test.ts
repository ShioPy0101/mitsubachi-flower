import assert from "node:assert/strict";
import test from "node:test";
import { FlowerApiError } from "../src/api/errors";
import { runDeviceAuthorizationFlow, SLOW_DOWN_INCREMENT_SECONDS } from "../src/auth/deviceFlow";

const authorization = {
  deviceCode: "device-secret",
  userCode: "ABCD-EFGH",
  verificationUri: "http://localhost:3000/flower/activate",
  verificationUriComplete: "http://localhost:3000/flower/activate?user_code=ABCD-EFGH",
  expiresIn: 60,
  interval: 5,
};

function token() {
  return { tokenType: "Bearer" as const, accessToken: "access-secret", expiresIn: 900, scope: "flower:read flower:download", organizationId: "1" };
}

function deviceError(serverCode: string): FlowerApiError {
  return new FlowerApiError({ code: "invalid_response", message: "Device authorization failed.", retryable: true, operation: "device_token_poll", serverCode });
}

test("runDeviceAuthorizationFlow continues after authorization_pending and returns token", async () => {
  let now = 0;
  let polls = 0;
  const delays: number[] = [];
  const result = await runDeviceAuthorizationFlow({
    client: {
      startDeviceAuthorization: async () => ({ data: authorization, httpStatus: 200 }),
      pollDeviceToken: async () => {
        polls += 1;
        if (polls === 1) throw deviceError("authorization_pending");
        return { data: token(), httpStatus: 200 };
      },
    },
    input: { clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "AE" },
    now: () => now,
    delay: async (ms) => {
      delays.push(ms);
      now += ms;
    },
  });
  assert.equal(result.pollCount, 2);
  assert.equal(result.token.accessToken, "access-secret");
  assert.deepEqual(delays, [5000, 5000]);
});

test("runDeviceAuthorizationFlow increases interval after slow_down", async () => {
  let now = 0;
  let polls = 0;
  const intervals: number[] = [];
  const delays: number[] = [];
  await runDeviceAuthorizationFlow({
    client: {
      startDeviceAuthorization: async () => ({ data: authorization, httpStatus: 200 }),
      pollDeviceToken: async () => {
        polls += 1;
        if (polls === 1) throw deviceError("slow_down");
        return { data: token(), httpStatus: 200 };
      },
    },
    input: { clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "AE" },
    now: () => now,
    delay: async (ms) => {
      delays.push(ms);
      now += ms;
    },
    onSlowDown: (interval) => intervals.push(interval),
  });
  assert.deepEqual(intervals, [authorization.interval + SLOW_DOWN_INCREMENT_SECONDS]);
  assert.deepEqual(delays, [5000, 10000]);
});

for (const code of ["access_denied", "expired_token", "invalid_grant", "invalid_request"]) {
  test("runDeviceAuthorizationFlow stops on " + code, async () => {
    let now = 0;
    await assert.rejects(
      () =>
        runDeviceAuthorizationFlow({
          client: {
            startDeviceAuthorization: async () => ({ data: authorization, httpStatus: 200 }),
            pollDeviceToken: async () => {
              throw deviceError(code);
            },
          },
          input: { clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "AE" },
          now: () => now,
          delay: async (ms) => {
            now += ms;
          },
        }),
      new RegExp(code === "access_denied" ? "denied" : "Start again|valid|invalid"),
    );
  });
}

test("runDeviceAuthorizationFlow stops on expiry", async () => {
  let now = 0;
  await assert.rejects(
    () =>
      runDeviceAuthorizationFlow({
        client: {
          startDeviceAuthorization: async () => ({ data: { ...authorization, expiresIn: 1 }, httpStatus: 200 }),
          pollDeviceToken: async () => {
            throw deviceError("authorization_pending");
          },
        },
        input: { clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "AE" },
        now: () => now,
        delay: async (ms) => {
          now += ms;
        },
      }),
    /expired/,
  );
});

test("runDeviceAuthorizationFlow stops on cancel", async () => {
  const controller = new AbortController();
  let now = 0;
  await assert.rejects(
    () =>
      runDeviceAuthorizationFlow({
        client: {
          startDeviceAuthorization: async () => ({ data: authorization, httpStatus: 200 }),
          pollDeviceToken: async () => ({ data: token(), httpStatus: 200 }),
        },
        input: { clientName: "mitsubachi-flower", clientVersion: "0.1.0", deviceName: "AE" },
        signal: controller.signal,
        now: () => now,
        delay: async (ms) => {
          now += ms;
          controller.abort();
        },
      }),
    /cancelled/,
  );
});
