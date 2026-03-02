/** Persisted authentication state (serializable) */
export interface AuthState {
  /** OAuth access token (Bearer token for API calls) */
  accessToken: string;

  /** OAuth refresh token (used to obtain new access tokens) */
  refreshToken: string;

  /** Absolute timestamp (ms since epoch) when the access token expires */
  expiresAt: number;

  /** ChatGPT account ID extracted from JWT claims */
  accountId?: string;
}

/**
 * Authenticated session — bundles the token state with optional
 * persistent storage so the provider can refresh and save tokens
 * automatically.
 *
 * Returned by `authenticate()` and passed to `createCodexOAuth()`.
 */
export interface Auth {
  /** Current token state */
  state: AuthState;

  /** If provided, refreshed tokens are persisted here automatically */
  storage?: import("../storage/types.js").TokenStorage;
}

/** Raw token response from the OAuth token endpoint */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in?: number;
  token_type: string;
}

/** Response from the device auth initiation endpoint */
export interface DeviceAuthInitResponse {
  user_code: string;
  device_auth_id: string;
  interval: string;
}

/** Response from the device auth polling endpoint on success (HTTP 200) */
export interface DeviceTokenSuccessResponse {
  authorization_code: string;
  code_verifier: string;
}

/** Parsed result from initiateDeviceAuth() */
export interface DeviceAuthResult {
  /** The code the user must enter at the verification URL */
  userCode: string;

  /** Unique identifier for this device auth session */
  deviceAuthId: string;

  /** URL where the user should enter their code */
  verifyUrl: string;

  /** Polling interval in milliseconds */
  intervalMs: number;
}
