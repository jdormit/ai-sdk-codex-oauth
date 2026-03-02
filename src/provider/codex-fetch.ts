import type { AuthState } from "../oauth/types.js";
import type { TokenStorage } from "../storage/types.js";
import { refreshAuthState } from "../oauth/token.js";
import { OAUTH_CLIENT_ID } from "../constants.js";

export interface CodexFetchOptions {
  /** Function that returns the current auth state */
  getAuth: () => Promise<AuthState>;

  /** Optional storage to persist refreshed tokens */
  storage?: TokenStorage;

  /** App identifier for the originator header */
  originator?: string;

  /** OAuth client ID for token refresh */
  clientId?: string;

  /** Underlying fetch implementation (default: globalThis.fetch) */
  baseFetch?: typeof globalThis.fetch;
}

/**
 * Create a fetch function that wraps requests to the Codex backend with:
 * - OAuth token injection and auto-refresh
 * - Forces stream: true and store: false
 * - Strips unsupported parameters (temperature, max_tokens)
 * - Adds Codex-specific headers (originator, ChatGPT-Account-Id)
 * - For non-streaming callers (doGenerate), reassembles SSE into a JSON response
 */
export function createCodexFetch(options: CodexFetchOptions): typeof globalThis.fetch {
  const {
    getAuth,
    storage,
    originator = "ai-sdk-codex-oauth",
    clientId = OAUTH_CLIENT_ID,
    baseFetch = globalThis.fetch,
  } = options;

  // Mutable ref to track the current auth state for refresh
  let cachedAuth: AuthState | null = null;

  async function ensureValidToken(): Promise<AuthState> {
    let auth = cachedAuth ?? (await getAuth());

    // Refresh if token expires within 60 seconds
    if (auth.expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAuthState(auth, clientId);
      if (!refreshed) {
        throw new Error("Token refresh failed — please re-authenticate");
      }
      auth = refreshed;
      await storage?.save(auth);
    }

    cachedAuth = auth;
    return auth;
  }

  return async function codexFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const auth = await ensureValidToken();

    // Clone init to avoid mutating the caller's object
    const newInit: RequestInit = { ...init };

    // Inject auth headers
    const existingHeaders = new Headers(init?.headers);
    existingHeaders.set("Authorization", `Bearer ${auth.accessToken}`);
    existingHeaders.set("originator", originator);
    if (auth.accountId) {
      existingHeaders.set("ChatGPT-Account-Id", auth.accountId);
    }
    newInit.headers = existingHeaders;

    // Modify request body if present
    let wasNonStreaming = false;
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;

        wasNonStreaming = !body["stream"];

        // Force Codex backend requirements
        body["stream"] = true;
        body["store"] = false;

        // Strip unsupported parameters
        delete body["temperature"];
        delete body["max_tokens"];

        newInit.body = JSON.stringify(body);
      } catch {
        // Not JSON — pass through unchanged
      }
    }

    const response = await baseFetch(input, newInit);

    // If the original request was non-streaming (from doGenerate),
    // we need to reassemble the SSE stream into a JSON response
    // because the provider expects a JSON body.
    if (wasNonStreaming && response.ok && response.body) {
      return reassembleStreamToJson(response);
    }

    return response;
  } as typeof globalThis.fetch;
}

/**
 * Read an SSE stream from the Codex backend, find the terminal event
 * (response.completed or response.incomplete), and return its response
 * payload as a synthetic JSON Response.
 *
 * The terminal event carries the full Response object including output[]
 * and usage, which is exactly what the @ai-sdk/openai doGenerate() parser expects.
 */
async function reassembleStreamToJson(
  sseResponse: Response,
): Promise<Response> {
  const reader = sseResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responsePayload: unknown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const type = parsed["type"] as string | undefined;

          // The terminal events carry the full response object
          if (
            type === "response.completed" ||
            type === "response.incomplete" ||
            type === "response.failed"
          ) {
            responsePayload = parsed["response"];
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!responsePayload) {
    // Fallback: build a minimal response from whatever we got
    return new Response(
      JSON.stringify({
        id: "resp_unknown",
        output: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
