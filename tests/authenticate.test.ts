import { describe, it, expect, vi, afterEach } from "vitest";
import { authenticate } from "../src/oauth/authenticate.js";
import { MemoryStorage } from "../src/storage/memory.js";
import type { AuthState } from "../src/oauth/types.js";

const validAuth: AuthState = {
  accessToken: "stored-token",
  refreshToken: "stored-refresh",
  expiresAt: Date.now() + 3600_000,
  accountId: "acct-stored",
};

const expiredAuth: AuthState = {
  ...validAuth,
  expiresAt: Date.now() - 1000, // Already expired
};

describe("authenticate", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns existing valid tokens from storage without network calls", async () => {
    const storage = new MemoryStorage();
    await storage.save(validAuth);

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const onUserCode = vi.fn();
    const result = await authenticate({ storage, onUserCode });

    expect(result).toEqual(validAuth);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onUserCode).not.toHaveBeenCalled();
  });

  it("refreshes expired tokens and returns updated state", async () => {
    const storage = new MemoryStorage();
    await storage.save(expiredAuth);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "refreshed-token",
          refresh_token: "refreshed-refresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    });

    const result = await authenticate({ storage, onUserCode: vi.fn() });

    expect(result.accessToken).toBe("refreshed-token");
    expect(result.refreshToken).toBe("refreshed-refresh");
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    // Should preserve accountId from original state
    expect(result.accountId).toBe("acct-stored");

    // Should also be saved to storage
    const saved = await storage.load();
    expect(saved!.accessToken).toBe("refreshed-token");
  });

  it("falls through to device flow when refresh fails", async () => {
    const storage = new MemoryStorage();
    await storage.save(expiredAuth);

    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      fetchCallCount++;
      const urlStr = String(url);

      // First call: refresh attempt -> fail
      if (urlStr.includes("oauth/token") && fetchCallCount === 1) {
        return { ok: false, status: 401 };
      }

      // Second call: device auth initiation
      if (urlStr.includes("deviceauth/usercode")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              user_code: "TEST-CODE",
              device_auth_id: "dev-id",
              interval: "1",
            }),
        };
      }

      // Third call: polling -> immediately succeed
      if (urlStr.includes("deviceauth/token")) {
        return {
          status: 200,
          json: () =>
            Promise.resolve({
              authorization_code: "auth-code",
              code_verifier: "verifier",
            }),
        };
      }

      // Fourth call: token exchange
      if (urlStr.includes("oauth/token")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: "new-token",
              refresh_token: "new-refresh",
              expires_in: 3600,
              token_type: "Bearer",
            }),
        };
      }

      return { ok: false, status: 500 };
    });

    const onUserCode = vi.fn();
    const result = await authenticate({
      storage,
      onUserCode,
      openBrowser: false,
    });

    expect(onUserCode).toHaveBeenCalledWith({
      userCode: "TEST-CODE",
      verifyUrl: "https://auth.openai.com/codex/device",
    });
    expect(result.accessToken).toBe("new-token");
  });

  it("returns stored tokens that are close to expiry but not yet expired", async () => {
    const storage = new MemoryStorage();

    // Token expires in 2 minutes — within the 60s threshold, so should refresh
    const nearExpiry: AuthState = {
      ...validAuth,
      expiresAt: Date.now() + 30_000, // 30s from now
    };
    await storage.save(nearExpiry);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "refreshed",
          refresh_token: "refreshed-refresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    });

    const result = await authenticate({ storage, onUserCode: vi.fn() });
    expect(result.accessToken).toBe("refreshed");
  });

  it("uses default MemoryStorage when no storage provided", async () => {
    // With no storage and no stored tokens, it should start device flow
    // We'll set up mocks for the full device flow

    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      fetchCallCount++;
      const urlStr = String(url);

      if (urlStr.includes("deviceauth/usercode")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              user_code: "CODE",
              device_auth_id: "id",
              interval: "1",
            }),
        };
      }

      if (urlStr.includes("deviceauth/token")) {
        return {
          status: 200,
          json: () =>
            Promise.resolve({
              authorization_code: "code",
              code_verifier: "verifier",
            }),
        };
      }

      if (urlStr.includes("oauth/token")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: "token",
              refresh_token: "refresh",
              expires_in: 3600,
              token_type: "Bearer",
            }),
        };
      }

      return { ok: false, status: 500 };
    });

    const result = await authenticate({
      onUserCode: vi.fn(),
      openBrowser: false,
    });

    expect(result.accessToken).toBe("token");
  });
});
