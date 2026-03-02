import type { AuthState, TokenResponse } from "./types.js";
import { extractAccountId } from "./jwt.js";
import {
  OAUTH_CLIENT_ID,
  OAUTH_TOKEN_URL,
  DEVICE_AUTH_REDIRECT_URI,
} from "../constants.js";

/**
 * Exchange an authorization code + PKCE verifier for OAuth tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string = OAUTH_CLIENT_ID,
): Promise<TokenResponse | null> {
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: DEVICE_AUTH_REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) return null;

    return (await response.json()) as TokenResponse;
  } catch {
    return null;
  }
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string = OAUTH_CLIENT_ID,
): Promise<TokenResponse | null> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) return null;

    return (await response.json()) as TokenResponse;
  } catch {
    return null;
  }
}

/**
 * Build an AuthState from a TokenResponse.
 */
export function buildAuthState(tokens: TokenResponse): AuthState {
  const accountId = extractAccountId(tokens);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId,
  };
}

/**
 * Attempt to refresh an existing AuthState, returning a new one.
 * Returns null if the refresh fails.
 */
export async function refreshAuthState(
  auth: AuthState,
  clientId: string = OAUTH_CLIENT_ID,
): Promise<AuthState | null> {
  const tokens = await refreshAccessToken(auth.refreshToken, clientId);
  if (!tokens) return null;

  return {
    ...auth,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}
