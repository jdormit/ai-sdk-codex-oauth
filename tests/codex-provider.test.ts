import { describe, it, expect } from "vitest";
import { createCodexOAuth } from "../src/provider/codex-provider.js";
import { MemoryStorage } from "../src/storage/memory.js";
import type { AuthState } from "../src/oauth/types.js";

const validAuth: AuthState = {
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600_000,
  accountId: "acct-123",
};

describe("createCodexOAuth", () => {
  it("creates a callable provider", () => {
    const codex = createCodexOAuth({ auth: validAuth });
    expect(typeof codex).toBe("function");
    expect(typeof codex.languageModel).toBe("function");
  });

  it("returns a language model for a valid model ID", () => {
    const codex = createCodexOAuth({ auth: validAuth });
    const model = codex("gpt-5.3-codex");

    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-5.3-codex");
    expect(model.provider).toBe("codex-oauth.responses");
  });

  it("throws for an invalid model ID", () => {
    const codex = createCodexOAuth({ auth: validAuth });

    expect(() => codex("gpt-4o")).toThrow(
      '"gpt-4o" is not available on the Codex backend',
    );
  });

  it("accepts legacy model IDs", () => {
    const codex = createCodexOAuth({ auth: validAuth });
    const model = codex("gpt-5.1-codex");
    expect(model.modelId).toBe("gpt-5.1-codex");
  });

  it("languageModel is the same function as the provider", () => {
    const codex = createCodexOAuth({ auth: validAuth });
    expect(codex.languageModel).toBe(codex);
  });

  it("accepts a TokenStorage as auth source", async () => {
    const storage = new MemoryStorage();
    await storage.save(validAuth);

    const codex = createCodexOAuth({ auth: storage });
    // Should not throw — storage has valid auth
    const model = codex("gpt-5.3-codex");
    expect(model).toBeDefined();
  });

  it("uses custom originator", () => {
    const codex = createCodexOAuth({
      auth: validAuth,
      originator: "my-custom-app",
    });
    // The originator is injected at fetch time, not at provider creation,
    // so we just verify it doesn't throw
    const model = codex("gpt-5.3-codex");
    expect(model).toBeDefined();
  });
});
