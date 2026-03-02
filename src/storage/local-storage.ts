import type { AuthState } from "../oauth/types.js";
import type { TokenStorage } from "./types.js";

const DEFAULT_KEY = "codex_oauth_auth";

/**
 * Browser localStorage-based token storage.
 * Throws at call time (not import time) if localStorage is not available.
 */
export class LocalStorageTokenStorage implements TokenStorage {
  private readonly key: string;

  constructor(key: string = DEFAULT_KEY) {
    this.key = key;
  }

  async load(): Promise<AuthState | null> {
    try {
      const raw = globalThis.localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as AuthState;
    } catch {
      return null;
    }
  }

  async save(state: AuthState): Promise<void> {
    globalThis.localStorage.setItem(this.key, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    globalThis.localStorage.removeItem(this.key);
  }
}
