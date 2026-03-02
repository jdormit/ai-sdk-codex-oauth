import type { AuthState } from "../oauth/types.js";
import type { TokenStorage } from "./types.js";

const DEFAULT_DIR_NAME = "ai-sdk-codex-oauth";
const TOKEN_FILE_NAME = "tokens.json";

/**
 * File-based token storage for Node.js environments.
 * Stores tokens as JSON in a configurable file path.
 *
 * Default path: ~/.config/ai-sdk-codex-oauth/tokens.json
 *
 * This module uses dynamic imports for `node:fs/promises`, `node:path`,
 * and `node:os` so it can be safely imported in browser bundles
 * (it will throw at call time, not import time, if Node APIs are absent).
 */
export class FileStorage implements TokenStorage {
  private readonly customPath: string | undefined;

  /**
   * @param path Optional explicit file path. If omitted, uses the
   *             platform-appropriate config directory.
   */
  constructor(path?: string) {
    this.customPath = path;
  }

  private async getFilePath(): Promise<string> {
    if (this.customPath) return this.customPath;

    const os = await import("node:os");
    const path = await import("node:path");

    const configDir =
      process.env["XDG_CONFIG_HOME"] ??
      path.join(os.homedir(), ".config");

    return path.join(configDir, DEFAULT_DIR_NAME, TOKEN_FILE_NAME);
  }

  async load(): Promise<AuthState | null> {
    try {
      const fs = await import("node:fs/promises");
      const filePath = await this.getFilePath();
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as AuthState;
    } catch {
      return null;
    }
  }

  async save(state: AuthState): Promise<void> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = await this.getFilePath();
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
  }

  async clear(): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const filePath = await this.getFilePath();
      await fs.unlink(filePath);
    } catch {
      // File may not exist — that's fine
    }
  }
}
