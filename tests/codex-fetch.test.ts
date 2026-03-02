import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCodexFetch } from "../src/provider/codex-fetch.js";
import { MemoryStorage } from "../src/storage/memory.js";
import type { AuthState } from "../src/oauth/types.js";

const validAuth: AuthState = {
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600_000, // 1 hour from now
  accountId: "acct-123",
};

/**
 * Build a minimal SSE stream containing a response.completed event.
 */
function buildSSEStream(responsePayload: Record<string, unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({ type: "response.created", response: { id: "resp_1" }, sequence_number: 0 })}\n\n`,
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello", sequence_number: 1 })}\n\n`,
    `data: ${JSON.stringify({ type: "response.completed", response: responsePayload, sequence_number: 2 })}\n\n`,
    `data: [DONE]\n\n`,
  ];
  const fullText = events.join("");

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(fullText));
      controller.close();
    },
  });
}

describe("createCodexFetch", () => {
  let mockBaseFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockBaseFetch = vi.fn();
  });

  it("injects Authorization, originator, and account ID headers", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      originator: "test-app",
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [], stream: true }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const headers = call[1]?.headers as Headers;

    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("originator")).toBe("test-app");
    expect(headers.get("ChatGPT-Account-Id")).toBe("acct-123");
  });

  it("forces stream: true and store: false in request body", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.3-codex",
        input: [],
        stream: false,
        store: true,
      }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const body = JSON.parse(call[1]?.body as string);

    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
  });

  it("strips unsupported parameters (temperature, max_tokens)", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.3-codex",
        input: [],
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const body = JSON.parse(call[1]?.body as string);

    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.model).toBe("gpt-5.3-codex"); // preserved
  });

  it("reassembles SSE stream to JSON for non-streaming requests", async () => {
    const completedPayload = {
      id: "resp_test",
      model: "gpt-5.3-codex",
      output: [
        {
          type: "message",
          role: "assistant",
          id: "msg_1",
          content: [
            {
              type: "output_text",
              text: "Hello world!",
              annotations: [],
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 0 },
        input_tokens_details: { cached_tokens: 0 },
      },
      error: null,
      incomplete_details: null,
    };

    const sseStream = buildSSEStream(completedPayload);

    mockBaseFetch.mockResolvedValue(
      new Response(sseStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    // Simulate a non-streaming request (like doGenerate makes)
    const response = await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.3-codex",
        input: [],
        // Note: no stream: true — this simulates doGenerate()
      }),
    });

    // Should be reassembled into a JSON response
    const json = await response.json();
    expect(json.id).toBe("resp_test");
    expect(json.output[0].content[0].text).toBe("Hello world!");
    expect(json.usage.input_tokens).toBe(10);
    expect(json.usage.output_tokens).toBe(5);
  });

  it("passes through SSE stream for streaming requests", async () => {
    const sseStream = buildSSEStream({ id: "resp_stream" });

    mockBaseFetch.mockResolvedValue(
      new Response(sseStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    // Streaming request — should NOT be reassembled
    const response = await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.3-codex",
        input: [],
        stream: true,
      }),
    });

    // Should be the raw SSE stream, not JSON
    expect(response.body).toBeDefined();
    const text = await response.text();
    expect(text).toContain("data: ");
    expect(text).toContain("response.completed");
  });

  it("omits ChatGPT-Account-Id header when accountId is not set", async () => {
    const authWithoutAccount: AuthState = {
      ...validAuth,
      accountId: undefined,
    };

    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => authWithoutAccount,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [], stream: true }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const headers = call[1]?.headers as Headers;
    expect(headers.has("ChatGPT-Account-Id")).toBe(false);
  });

  it("refreshes token when near expiry and persists to storage", async () => {
    const nearExpiry: AuthState = {
      ...validAuth,
      expiresAt: Date.now() + 30_000, // 30s from now (within 60s threshold)
    };

    const storage = new MemoryStorage();

    // Mock the refresh endpoint
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "refreshed-token",
          refresh_token: "refreshed-refresh",
          expires_in: 7200,
          token_type: "Bearer",
        }),
    });

    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => nearExpiry,
      storage,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [], stream: true }),
    });

    // Should have used the refreshed token
    const call = mockBaseFetch.mock.calls[0]!;
    const headers = call[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer refreshed-token");

    // Should have persisted the refreshed token
    const saved = await storage.load();
    expect(saved).not.toBeNull();
    expect(saved!.accessToken).toBe("refreshed-token");

    globalThis.fetch = originalFetch;
  });

  it("returns a fallback JSON response when SSE has no terminal event", async () => {
    // SSE stream with no response.completed event
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hi" })}\n\n` +
            `data: [DONE]\n\n`,
          ),
        );
        controller.close();
      },
    });

    mockBaseFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    const response = await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [] }),
    });

    const json = await response.json();
    expect(json.id).toBe("resp_unknown");
    expect(json.output).toEqual([]);
  });

  it("injects empty instructions when not present (Codex backend requires it)", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [], stream: true }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const body = JSON.parse(call[1]?.body as string);
    expect(body.instructions).toBe("");
  });

  it("preserves existing instructions when already set", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.3-codex",
        input: [],
        stream: true,
        instructions: "You are a pirate.",
      }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const body = JSON.parse(call[1]?.body as string);
    expect(body.instructions).toBe("You are a pirate.");
  });

  it("strips the user-agent header to avoid CORS preflight failures", async () => {
    mockBaseFetch.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const codexFetch = createCodexFetch({
      getAuth: async () => validAuth,
      baseFetch: mockBaseFetch,
    });

    // Simulate what the AI SDK does: set a user-agent header
    await codexFetch("https://example.com/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": "ai-sdk/openai/1.3.22 ai-sdk/provider-utils/2.2.8 runtime/browser",
      },
      body: JSON.stringify({ model: "gpt-5.3-codex", input: [], stream: true }),
    });

    const call = mockBaseFetch.mock.calls[0]!;
    const headers = call[1]?.headers as Headers;
    expect(headers.has("user-agent")).toBe(false);
    // But other headers should still be present
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("originator")).toBe("ai-sdk-codex-oauth");
  });
});
