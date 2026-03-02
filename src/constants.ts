/** OpenAI OAuth client ID (same as Codex CLI / OpenCode) */
export const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** OAuth token endpoint */
export const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

/** Device code flow: initiation endpoint */
export const DEVICE_AUTH_URL =
  "https://auth.openai.com/api/accounts/deviceauth/usercode";

/** Device code flow: polling endpoint */
export const DEVICE_TOKEN_URL =
  "https://auth.openai.com/api/accounts/deviceauth/token";

/** Device code flow: redirect URI used in the token exchange */
export const DEVICE_AUTH_REDIRECT_URI =
  "https://auth.openai.com/deviceauth/callback";

/** URL where users enter their device code */
export const DEVICE_VERIFY_URL = "https://auth.openai.com/codex/device";

/** Codex backend base URL (append /responses for the Responses API) */
export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

/** Default model */
export const DEFAULT_MODEL = "gpt-5.3-codex";
