import { describe, it, expect } from "vitest";
import {
  validateModelId,
  CODEX_MODELS,
  CODEX_LEGACY_MODELS,
} from "../src/provider/models.js";

describe("validateModelId", () => {
  it("accepts all current models", () => {
    for (const model of CODEX_MODELS) {
      expect(() => validateModelId(model)).not.toThrow();
    }
  });

  it("accepts all legacy models", () => {
    for (const model of CODEX_LEGACY_MODELS) {
      expect(() => validateModelId(model)).not.toThrow();
    }
  });

  it("throws for an unknown model", () => {
    expect(() => validateModelId("gpt-4o")).toThrow(
      '"gpt-4o" is not available on the Codex backend',
    );
  });

  it("throws for empty string", () => {
    expect(() => validateModelId("")).toThrow(
      'is not available on the Codex backend',
    );
  });

  it("error message lists available models", () => {
    try {
      validateModelId("invalid-model");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("gpt-5.3-codex");
      expect(msg).toContain("gpt-5.2-codex");
      expect(msg).toContain("Available models:");
    }
  });

  it("does not list legacy models in the error message", () => {
    try {
      validateModelId("invalid-model");
    } catch (e) {
      const msg = (e as Error).message;
      // Legacy models should not be in the "Available models" hint
      expect(msg).not.toContain("gpt-5.1-codex,");
      expect(msg).not.toContain("gpt-5-codex,");
    }
  });
});

describe("CODEX_MODELS", () => {
  it("has gpt-5.3-codex as the first (default) model", () => {
    expect(CODEX_MODELS[0]).toBe("gpt-5.3-codex");
  });

  it("does not overlap with CODEX_LEGACY_MODELS", () => {
    const currentSet = new Set<string>(CODEX_MODELS);
    for (const legacy of CODEX_LEGACY_MODELS) {
      expect(currentSet.has(legacy)).toBe(false);
    }
  });
});
