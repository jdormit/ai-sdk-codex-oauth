import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initiateDeviceAuth, pollDeviceAuth } from "../src/oauth/device-flow.js";

describe("initiateDeviceAuth", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed device auth result on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          user_code: "ABCD-1234",
          device_auth_id: "dev-auth-id",
          interval: "5",
        }),
    });

    const result = await initiateDeviceAuth("test-client-id");

    expect(result).toEqual({
      userCode: "ABCD-1234",
      deviceAuthId: "dev-auth-id",
      verifyUrl: "https://auth.openai.com/codex/device",
      intervalMs: 8000, // 5 * 1000 + 3000 safety margin
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://auth.openai.com/api/accounts/deviceauth/usercode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ client_id: "test-client-id" }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(initiateDeviceAuth()).rejects.toThrow(
      "Device auth initiation failed (500)",
    );
  });

  it("uses default interval of 5s when interval is not a number", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          user_code: "CODE",
          device_auth_id: "id",
          interval: "not-a-number",
        }),
    });

    const result = await initiateDeviceAuth();
    expect(result.intervalMs).toBe(8000); // (5 default) * 1000 + 3000
  });
});

describe("pollDeviceAuth", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns authorization code on success (200)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () =>
        Promise.resolve({
          authorization_code: "auth-code-123",
          code_verifier: "verifier-456",
        }),
    });

    const result = await pollDeviceAuth({
      deviceAuthId: "dev-id",
      userCode: "CODE",
      intervalMs: 10, // fast for tests
    });

    expect(result).toEqual({
      authorization_code: "auth-code-123",
      code_verifier: "verifier-456",
    });
  });

  it("polls until success after pending responses", async () => {
    const onStatus = vi.fn();
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          status: 403,
          text: () => Promise.resolve("Pending"),
        });
      }
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            authorization_code: "code",
            code_verifier: "verifier",
          }),
      });
    });

    const result = await pollDeviceAuth({
      deviceAuthId: "dev-id",
      userCode: "CODE",
      intervalMs: 10,
      onStatus,
    });

    expect(result.authorization_code).toBe("code");
    expect(onStatus).toHaveBeenCalledWith("Waiting for authorization...");
    expect(callCount).toBe(3);
  });

  it("also treats 404 as pending", async () => {
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 404,
          text: () => Promise.resolve("Not found"),
        });
      }
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            authorization_code: "code",
            code_verifier: "verifier",
          }),
      });
    });

    const result = await pollDeviceAuth({
      deviceAuthId: "dev-id",
      userCode: "CODE",
      intervalMs: 10,
    });

    expect(result.authorization_code).toBe("code");
  });

  it("throws on unexpected error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    await expect(
      pollDeviceAuth({
        deviceAuthId: "dev-id",
        userCode: "CODE",
        intervalMs: 10,
      }),
    ).rejects.toThrow("Device auth polling error (500)");
  });

  it("times out after maxAttempts", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 403,
      text: () => Promise.resolve("Pending"),
    });

    await expect(
      pollDeviceAuth({
        deviceAuthId: "dev-id",
        userCode: "CODE",
        intervalMs: 10,
        timeoutMs: 30, // 30ms timeout with 10ms interval = ~3 attempts
      }),
    ).rejects.toThrow("Device auth polling timed out");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation(() => {
      // Abort after the first fetch call
      controller.abort();
      return Promise.resolve({
        status: 403,
        text: () => Promise.resolve("Pending"),
      });
    });

    await expect(
      pollDeviceAuth({
        deviceAuthId: "dev-id",
        userCode: "CODE",
        intervalMs: 10,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
