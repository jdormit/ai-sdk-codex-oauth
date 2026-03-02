import { describe, it, expect, vi, afterEach } from "vitest";
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  buildAuthState,
  refreshAuthState,
} from "../src/oauth/token.js";
import type { AuthState, TokenResponse } from "../src/oauth/types.js";

const mockTokenResponse: TokenResponse = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  id_token: undefined,
  expires_in: 7200,
  token_type: "Bearer",
};

describe("exchangeCodeForTokens", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exchanges code for tokens", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    });

    const result = await exchangeCodeForTokens("auth-code", "verifier", "client-id");
    expect(result).toEqual(mockTokenResponse);

    // Verify the request
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("https://auth.openai.com/oauth/token");
    const body = call[1]?.body as string;
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=auth-code");
    expect(body).toContain("code_verifier=verifier");
    expect(body).toContain("client_id=client-id");
  });

  it("returns null on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    expect(await exchangeCodeForTokens("code", "verifier")).toBeNull();
  });

  it("returns null on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    expect(await exchangeCodeForTokens("code", "verifier")).toBeNull();
  });
});

describe("refreshAccessToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("refreshes with a refresh token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    });

    const result = await refreshAccessToken("old-refresh-token", "client-id");
    expect(result).toEqual(mockTokenResponse);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = call[1]?.body as string;
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh-token");
    expect(body).toContain("client_id=client-id");
  });

  it("returns null on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    expect(await refreshAccessToken("token")).toBeNull();
  });
});

describe("buildAuthState", () => {
  it("builds auth state from token response", () => {
    const before = Date.now();
    const state = buildAuthState(mockTokenResponse);
    const after = Date.now();

    expect(state.accessToken).toBe("new-access-token");
    expect(state.refreshToken).toBe("new-refresh-token");
    expect(state.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000);
    expect(state.expiresAt).toBeLessThanOrEqual(after + 7200 * 1000);
  });

  it("defaults to 3600s expiry when expires_in is missing", () => {
    const before = Date.now();
    const state = buildAuthState({
      access_token: "token",
      refresh_token: "refresh",
      token_type: "Bearer",
    });
    const after = Date.now();

    expect(state.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(state.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
  });
});

describe("refreshAuthState", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("refreshes and returns updated auth state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    });

    const oldAuth: AuthState = {
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1000,
      accountId: "acct-123",
    };

    const result = await refreshAuthState(oldAuth);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new-access-token");
    expect(result!.refreshToken).toBe("new-refresh-token");
    // accountId should be preserved from the old state
    expect(result!.accountId).toBe("acct-123");
  });

  it("returns null when refresh fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const oldAuth: AuthState = {
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1000,
    };

    expect(await refreshAuthState(oldAuth)).toBeNull();
  });
});
