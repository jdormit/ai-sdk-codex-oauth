import type { AuthState } from "./types.js";
import type { TokenStorage } from "../storage/types.js";
import { MemoryStorage } from "../storage/memory.js";
import { initiateDeviceAuth, pollDeviceAuth } from "./device-flow.js";
import { exchangeCodeForTokens, buildAuthState, refreshAuthState } from "./token.js";
import { OAUTH_CLIENT_ID } from "../constants.js";

export interface AuthenticateOptions {
  /** Where to persist tokens. Defaults to in-memory. */
  storage?: TokenStorage;

  /** OAuth client ID (default: Codex CLI client ID) */
  clientId?: string;

  /**
   * Called when the user needs to visit a URL and enter a code.
   * If not provided and openBrowser is true (default), the URL
   * will be opened automatically.
   */
  onUserCode?: (info: { userCode: string; verifyUrl: string }) => void;

  /**
   * Automatically open the verification URL in the default browser.
   * - Node.js: uses dynamic `import('open')` — install `open` as a dependency
   * - Browser: uses `window.open()`
   *
   * If `onUserCode` is provided, this defaults to false.
   * Otherwise, defaults to true.
   */
  openBrowser?: boolean;

  /** Status updates during polling */
  onStatus?: (message: string) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Maximum time to poll for authorization in ms (default: 5 minutes) */
  timeoutMs?: number;
}

/**
 * Authenticate with the Codex backend.
 *
 * 1. Checks storage for valid, non-expired tokens → returns immediately
 * 2. If tokens are expired, attempts a refresh → returns on success
 * 3. Otherwise, initiates the device code flow and waits for user authorization
 *
 * Returns the authenticated state, which is also persisted to storage.
 */
export async function authenticate(
  options: AuthenticateOptions = {},
): Promise<AuthState> {
  const {
    storage = new MemoryStorage(),
    clientId = OAUTH_CLIENT_ID,
    onUserCode,
    onStatus,
    signal,
    timeoutMs,
  } = options;

  const openBrowser = options.openBrowser ?? (onUserCode == null);

  // Step 1: Check for existing valid tokens
  const existing = await storage.load();
  if (existing && existing.expiresAt > Date.now() + 60_000) {
    return existing;
  }

  // Step 2: Try refreshing expired tokens
  if (existing?.refreshToken) {
    onStatus?.("Refreshing access token...");
    const refreshed = await refreshAuthState(existing, clientId);
    if (refreshed) {
      await storage.save(refreshed);
      return refreshed;
    }
    // Refresh failed — fall through to device code flow
    await storage.clear();
  }

  // Step 3: Device code flow
  onStatus?.("Starting device code flow...");
  const { userCode, deviceAuthId, verifyUrl, intervalMs } =
    await initiateDeviceAuth(clientId);

  // Notify the user / open browser
  if (onUserCode) {
    onUserCode({ userCode, verifyUrl });
  }

  if (openBrowser) {
    await openVerifyUrl(verifyUrl);
  }

  if (!onUserCode && !openBrowser) {
    // Last resort: print to console
    console.log(`Visit ${verifyUrl} and enter code: ${userCode}`);
  }

  // Poll for authorization
  const { authorization_code, code_verifier } = await pollDeviceAuth({
    deviceAuthId,
    userCode,
    intervalMs,
    onStatus,
    signal,
    timeoutMs,
  });

  // Exchange for tokens
  onStatus?.("Exchanging authorization code for tokens...");
  const tokens = await exchangeCodeForTokens(
    authorization_code,
    code_verifier,
    clientId,
  );
  if (!tokens) {
    throw new Error("Failed to exchange authorization code for tokens");
  }

  const auth = buildAuthState(tokens);
  await storage.save(auth);
  return auth;
}

/**
 * Open a URL in the default browser.
 * Browser: window.open()
 * Node.js: dynamic import('open') with fallback
 */
async function openVerifyUrl(url: string): Promise<void> {
  // Browser environment
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank");
    return;
  }

  // Node.js environment — try the 'open' package.
  // Use indirect import to prevent bundlers from resolving this statically.
  try {
    const moduleName = "open";
    const open = await (Function("m", "return import(m)")(moduleName) as Promise<{ default: (url: string) => Promise<void> }>);
    await open.default(url);
  } catch {
    // 'open' not installed — just log the URL
    console.log(`Open this URL in your browser: ${url}`);
  }
}
