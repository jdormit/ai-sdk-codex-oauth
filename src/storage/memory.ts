import type { AuthState } from "../oauth/types.js";
import type { TokenStorage } from "./types.js";

/**
 * In-memory token storage. Tokens are lost when the process exits.
 * Useful for ephemeral scripts or testing.
 */
export class MemoryStorage implements TokenStorage {
  private state: AuthState | null = null;

  async load(): Promise<AuthState | null> {
    return this.state;
  }

  async save(state: AuthState): Promise<void> {
    this.state = state;
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}
