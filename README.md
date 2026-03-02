# ai-sdk-codex-oauth

Vercel AI SDK provider for the ChatGPT Codex backend. Authenticates via OAuth device code flow using your ChatGPT subscription — no API key needed.

## Install

```bash
npm install ai-sdk-codex-oauth ai
```

## Quick Start

```ts
import { authenticate, createCodexOAuth } from "ai-sdk-codex-oauth";
import { generateText } from "ai";

const auth = await authenticate({ openBrowser: true });
const codex = createCodexOAuth({ auth });

const { text } = await generateText({
  model: codex("gpt-5.3-codex"),
  prompt: "Hello!",
});
```

## Browser Usage

In the browser, use `LocalStorageTokenStorage` to persist tokens across page reloads, and `onUserCode` to display the login code in your UI:

```ts
import { authenticate, createCodexOAuth, LocalStorageTokenStorage } from "ai-sdk-codex-oauth";
import { streamText } from "ai";

const storage = new LocalStorageTokenStorage();

await authenticate({
  storage,
  onUserCode: ({ userCode, verifyUrl }) => {
    // Show the code and link in your UI
    console.log(`Go to ${verifyUrl} and enter: ${userCode}`);
  },
});

const codex = createCodexOAuth({ auth: storage });

const result = streamText({
  model: codex("gpt-5.3-codex"),
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

> **CORS restriction:** The Codex backend only allows browser requests from specific localhost ports: **3000**, **5173**, and **8000**. If your dev server uses a different port, the request will fail with a CORS error. Configure your dev server accordingly (e.g. Vite defaults to 5173, which works).

## Authentication

The `authenticate()` function handles the full auth lifecycle:

1. Checks storage for valid, non-expired tokens
2. If tokens are expired, attempts a refresh
3. Otherwise, initiates the OAuth device code flow

| Option | Description |
|---|---|
| `storage` | `TokenStorage` instance for persistence (default: in-memory) |
| `onUserCode` | Callback receiving `{ userCode, verifyUrl }` when the user needs to authorize |
| `openBrowser` | Auto-open the verification URL (default: `true` unless `onUserCode` is set) |
| `onStatus` | Callback for status updates during polling |
| `signal` | `AbortSignal` for cancellation |
| `timeoutMs` | Max polling time in ms (default: 5 minutes) |

For Node.js, install the `open` package to enable automatic browser opening:

```bash
npm install open
```

## Provider Options

```ts
const codex = createCodexOAuth({
  // Required: AuthState object or TokenStorage instance
  auth: storage,

  // Optional: identifier sent in the `originator` header (default: "ai-sdk-codex-oauth")
  originator: "my-app",

  // Optional: custom base URL
  baseURL: "https://chatgpt.com/backend-api/codex",

  // Optional: OAuth client ID for token refresh
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
});
```

## System Instructions

The Codex backend requires an `instructions` field in every request. The middleware defaults to an empty string if none is provided.

The simplest way to give the model system-level context is the standard `system` param:

```ts
const { text } = await generateText({
  model: codex("gpt-5.3-codex"),
  system: "You are a helpful assistant.",
  prompt: "Hello!",
});
```

This is converted to a `developer` message in the `input` array. To set the top-level `instructions` field instead, use provider options:

```ts
const { text } = await generateText({
  model: codex("gpt-5.3-codex"),
  prompt: "Hello!",
  providerOptions: {
    openai: { instructions: "You are a helpful assistant." },
  },
});
```

For most use cases, `system` is simpler and sufficient.

## Models

| Model | Description |
|---|---|
| `gpt-5.3-codex` | Latest Codex model (default) |
| `gpt-5.2-codex` | Previous generation |
| `gpt-5.1-codex-max` | Extended context |
| `gpt-5.1-codex-mini` | Smaller / faster |
| `gpt-5.2` | Non-Codex variant |

Legacy models (`gpt-5.1-codex`, `gpt-5.1`, `gpt-5-codex`, `gpt-5`, `gpt-5-codex-mini`) are also accepted but not advertised. Invalid model IDs throw an error.

## Token Storage

The `TokenStorage` interface has three methods: `load()`, `save(state)`, and `clear()`. Built-in implementations:

| Class | Environment | Storage location |
|---|---|---|
| `MemoryStorage` | Any | In-process memory (lost on restart) |
| `LocalStorageTokenStorage` | Browser | `localStorage` |
| `FileStorage` | Node.js | `~/.config/ai-sdk-codex-oauth/auth.json` |

Implement `TokenStorage` for custom backends (database, keychain, etc.).

## CORS and Allowed Origins

The Codex backend restricts browser CORS requests to a specific set of localhost ports:

- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8000`

Requests from other origins (including `localhost` on other ports) will fail with `400 Disallowed CORS origin`. This only affects browser apps — Node.js is unaffected.

If you use Vite, its default port (5173) works. Set `strictPort: true` in your Vite config to avoid silent port incrementing:

```ts
// vite.config.ts
export default defineConfig({
  server: { port: 5173, strictPort: true },
});
```

## Codex Backend Constraints

The Codex backend differs from the standard OpenAI API in several ways. The fetch middleware handles these automatically:

- **Streaming only** — `stream` is always forced to `true`
- **No storage** — `store` is always forced to `false`
- **Instructions required** — defaults to `""` if not provided
- **No temperature or max_tokens** — these parameters are stripped from requests
- **Requires a ChatGPT Plus, Pro, or Team subscription**

## Example App

A browser-based chat app is included in `example/`:

```bash
cd example
npm install
npm run dev
```

This starts a Vite dev server on port 5173. Log in with your ChatGPT account, pick a model, and chat.

## License

MIT
