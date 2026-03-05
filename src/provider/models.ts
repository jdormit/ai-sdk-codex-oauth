/** Models shown in documentation and UI */
export const CODEX_MODELS = [
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.3-codex-spark",
] as const;

/** Hidden/legacy models that still work on the Codex backend */
export const CODEX_LEGACY_MODELS = [
  "gpt-5.1-codex",
  "gpt-5.1",
  "gpt-5-codex",
  "gpt-5",
  "gpt-5-codex-mini",
] as const;

export type CodexModelId =
  | (typeof CODEX_MODELS)[number]
  | (typeof CODEX_LEGACY_MODELS)[number];

const ALL_MODEL_IDS: ReadonlySet<string> = new Set([
  ...CODEX_MODELS,
  ...CODEX_LEGACY_MODELS,
]);

/**
 * Validate that a model ID is available on the Codex backend.
 * Throws a descriptive error for invalid model IDs.
 */
export function validateModelId(
  modelId: string,
): asserts modelId is CodexModelId {
  if (!ALL_MODEL_IDS.has(modelId)) {
    throw new Error(
      `"${modelId}" is not available on the Codex backend. ` +
        `Available models: ${CODEX_MODELS.join(", ")}`,
    );
  }
}
