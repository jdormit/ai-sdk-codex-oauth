import {
  authenticate,
  createCodexOAuth,
  LocalStorageTokenStorage,
  CODEX_MODELS,
  DEFAULT_MODEL,
} from "ai-sdk-codex-oauth";
import type { CodexOAuthProvider } from "ai-sdk-codex-oauth";
import { streamText } from "ai";

// ---- DOM refs ----

const loginScreen = document.getElementById("login-screen")!;
const chatScreen = document.getElementById("chat-screen")!;
const loginBtn = document.getElementById("login-btn") as HTMLButtonElement;
const loginStatus = document.getElementById("login-status")!;
const deviceCodeEl = document.getElementById("device-code")!;
const userCodeEl = document.getElementById("user-code")!;
const verifyLink = document.getElementById("verify-link") as HTMLAnchorElement;
const messagesEl = document.getElementById("messages")!;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const modelSelect = document.getElementById(
  "model-select",
) as HTMLSelectElement;
const logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement;

// ---- State ----

const storage = new LocalStorageTokenStorage();
let provider: CodexOAuthProvider | null = null;
let isStreaming = false;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const history: ChatMessage[] = [];

// ---- Init ----

async function init() {
  // Populate model selector
  for (const model of CODEX_MODELS) {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model;
    if (model === DEFAULT_MODEL) opt.selected = true;
    modelSelect.appendChild(opt);
  }
}

// ---- Screens ----

function showLogin() {
  loginScreen.hidden = false;
  chatScreen.hidden = true;
  loginBtn.disabled = false;
  loginStatus.hidden = true;
  deviceCodeEl.hidden = true;
}

function showChat() {
  loginScreen.hidden = true;
  chatScreen.hidden = false;
  chatInput.focus();
}

// ---- Login flow ----

async function doAuth() {
  loginBtn.disabled = true;
  loginStatus.hidden = false;
  loginStatus.className = "status";
  loginStatus.textContent = "Starting authentication...";

  try {
    const auth = await authenticate({
      storage,
      openBrowser: false, // We show the code + link in the UI instead
      onUserCode: ({ userCode, verifyUrl }) => {
        deviceCodeEl.hidden = false;
        userCodeEl.textContent = userCode;
        verifyLink.href = verifyUrl;

        // Also open in a new tab
        window.open(verifyUrl, "_blank");
      },
      onStatus: (msg) => {
        loginStatus.textContent = msg;
      },
    });

    provider = createCodexOAuth({
      auth,
      originator: "codex-chat-example",
    });
    showChat();
  } catch (err) {
    loginStatus.className = "status error";
    loginStatus.textContent = `Error: ${(err as Error).message}`;
    loginBtn.disabled = false;
    deviceCodeEl.hidden = true;
  }
}

loginBtn.addEventListener("click", doAuth);

// ---- Logout ----

logoutBtn.addEventListener("click", async () => {
  await storage.clear();
  provider = null;
  history.length = 0;
  messagesEl.innerHTML = "";
  showLogin();
});

// ---- Chat ----

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !provider || isStreaming) return;

  // Add user message
  history.push({ role: "user", content: text });
  appendMessageEl("user", text);
  chatInput.value = "";
  chatInput.style.height = "auto";

  // Create assistant message placeholder
  const assistantEl = appendMessageEl("assistant", "");
  assistantEl.classList.add("streaming", "typing-cursor");

  isStreaming = true;
  sendBtn.disabled = true;
  chatInput.disabled = true;

  try {
    const model = modelSelect.value;
    const result = streamText({
      model: provider(model),
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    let fullResponse = "";

    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      assistantEl.textContent = fullResponse;
      scrollToBottom();
    }

    history.push({ role: "assistant", content: fullResponse });
    assistantEl.classList.remove("streaming", "typing-cursor");
  } catch (err) {
    assistantEl.remove();
    const msg = (err as Error).message;
    appendMessageEl("error", `Error: ${msg}`);

    // If auth-related, go back to login
    if (
      msg.includes("re-authenticate") ||
      msg.includes("Not authenticated") ||
      msg.includes("No stored auth")
    ) {
      await storage.clear();
      provider = null;
      setTimeout(showLogin, 2000);
    }
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

function appendMessageEl(
  role: "user" | "assistant" | "error",
  text: string,
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Go ----

// On load, populate the model selector then attempt auth.
// If storage has valid tokens, authenticate() returns immediately
// and we skip straight to the chat screen. Otherwise the login
// screen is shown and the user clicks the login button.
init().then(doAuth);
