import type {
  DeviceAuthInitResponse,
  DeviceAuthResult,
  DeviceTokenSuccessResponse,
} from "./types.js";
import {
  OAUTH_CLIENT_ID,
  DEVICE_AUTH_URL,
  DEVICE_TOKEN_URL,
  DEVICE_VERIFY_URL,
} from "../constants.js";

/**
 * Initiate the device authorization flow.
 * Returns the user code and verification URL.
 */
export async function initiateDeviceAuth(
  clientId: string = OAUTH_CLIENT_ID,
): Promise<DeviceAuthResult> {
  const response = await fetch(DEVICE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Device auth initiation failed (${response.status}): ${text}`,
    );
  }

  const data = (await response.json()) as DeviceAuthInitResponse;
  const serverInterval = parseInt(data.interval, 10) || 5;

  return {
    userCode: data.user_code,
    deviceAuthId: data.device_auth_id,
    verifyUrl: DEVICE_VERIFY_URL,
    // Add 3 second safety margin to avoid rate-limit 429s
    intervalMs: serverInterval * 1000 + 3000,
  };
}

export interface PollDeviceAuthOptions {
  /** Device auth ID from initiateDeviceAuth() */
  deviceAuthId: string;

  /** User code from initiateDeviceAuth() */
  userCode: string;

  /** Polling interval in ms */
  intervalMs: number;

  /** Status callback during polling */
  onStatus?: (message: string) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Maximum time to poll in ms (default: 5 minutes) */
  timeoutMs?: number;
}

/**
 * Poll the device auth endpoint until the user authorizes.
 * Returns the authorization code and PKCE verifier.
 */
export async function pollDeviceAuth(
  options: PollDeviceAuthOptions,
): Promise<DeviceTokenSuccessResponse> {
  const {
    deviceAuthId,
    userCode,
    intervalMs,
    onStatus,
    signal,
    timeoutMs = 300_000,
  } = options;

  const maxAttempts = Math.ceil(timeoutMs / intervalMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error("Device auth polling cancelled");
    }

    await sleep(intervalMs, signal);

    const response = await fetch(DEVICE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_auth_id: deviceAuthId,
        user_code: userCode,
      }),
      signal,
    });

    if (response.status === 200) {
      return (await response.json()) as DeviceTokenSuccessResponse;
    }

    if (response.status === 403 || response.status === 404) {
      // Still pending — user hasn't authorized yet
      onStatus?.("Waiting for authorization...");
      continue;
    }

    const text = await response.text();
    throw new Error(
      `Device auth polling error (${response.status}): ${text}`,
    );
  }

  throw new Error("Device auth polling timed out");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}
