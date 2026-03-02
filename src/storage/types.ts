import type { AuthState } from "../oauth/types.js";

/**
 * Pluggable interface for persisting OAuth tokens.
 * Implement this to use a custom storage backend.
 */
export interface TokenStorage {
  /** Load stored auth state. Returns null if nothing stored or data is corrupt. */
  load(): Promise<AuthState | null>;

  /** Persist auth state. */
  save(state: AuthState): Promise<void>;

  /** Remove stored auth state. */
  clear(): Promise<void>;
}
