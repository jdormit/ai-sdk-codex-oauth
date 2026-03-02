import { createOpenAI } from "@ai-sdk/openai";
import type { Auth } from "../oauth/types.js";
import { createCodexFetch } from "./codex-fetch.js";
import { validateModelId } from "./models.js";
import { CODEX_BASE_URL } from "../constants.js";

export interface CodexOAuthSettings {
  /**
   * Authentication object returned by `authenticate()`.
   * Bundles the token state with optional persistent storage
   * so the provider can refresh and save tokens automatically.
   */
  auth: Auth;

  /** App identifier sent in the `originator` header (default: "ai-sdk-codex-oauth") */
  originator?: string;
}

/**
 * Provider function type — callable to get a language model,
 * with an explicit languageModel method.
 */
export interface CodexOAuthProvider {
  /**
   * Create a language model for the given Codex model ID.
   * Throws if the model ID is not valid for the Codex backend.
   */
  (modelId: string): ReturnType<ReturnType<typeof createOpenAI>["responses"]>;

  /**
   * Explicit languageModel method (same as calling the provider directly).
   */
  languageModel: CodexOAuthProvider;
}

/**
 * Create an AI SDK provider that authenticates with the ChatGPT Codex backend
 * using OAuth tokens.
 *
 * This wraps `@ai-sdk/openai`'s provider with a custom fetch middleware that
 * handles token injection, refresh, and Codex backend constraints.
 *
 * @example
 * ```ts
 * import { authenticate, createCodexOAuth } from "ai-sdk-codex-oauth";
 * import { generateText } from "ai";
 *
 * const auth = await authenticate({
 *   onUserCode: ({ userCode, verifyUrl }) => {
 *     console.log(`Go to ${verifyUrl} and enter: ${userCode}`);
 *   },
 * });
 * const codex = createCodexOAuth({ auth });
 *
 * const { text } = await generateText({
 *   model: codex("gpt-5.3-codex"),
 *   prompt: "Hello!",
 * });
 * ```
 */
export function createCodexOAuth(
  settings: CodexOAuthSettings,
): CodexOAuthProvider {
  const { auth } = settings;

  const codexFetch = createCodexFetch({
    getAuth: async () => auth.state,
    storage: auth.storage,
    originator: settings.originator,
  });

  const openai = createOpenAI({
    name: "codex-oauth",
    baseURL: CODEX_BASE_URL,
    // Placeholder — real auth is injected by codexFetch
    apiKey: "oauth-managed",
    fetch: codexFetch,
  });

  const provider = ((modelId: string) => {
    validateModelId(modelId);
    return openai.responses(modelId);
  }) as CodexOAuthProvider;

  provider.languageModel = provider;

  return provider;
}
