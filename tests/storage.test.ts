import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStorage } from "../src/storage/memory.js";
import { FileStorage } from "../src/storage/file.js";
import type { AuthState } from "../src/oauth/types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockAuth: AuthState = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: Date.now() + 3600_000,
  accountId: "acct-test",
};

describe("MemoryStorage", () => {
  it("returns null when empty", async () => {
    const storage = new MemoryStorage();
    expect(await storage.load()).toBeNull();
  });

  it("saves and loads auth state", async () => {
    const storage = new MemoryStorage();
    await storage.save(mockAuth);
    expect(await storage.load()).toEqual(mockAuth);
  });

  it("clears auth state", async () => {
    const storage = new MemoryStorage();
    await storage.save(mockAuth);
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });

  it("overwrites existing state on save", async () => {
    const storage = new MemoryStorage();
    await storage.save(mockAuth);

    const updated = { ...mockAuth, accessToken: "new-token" };
    await storage.save(updated);

    expect(await storage.load()).toEqual(updated);
  });
});

describe("FileStorage", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "codex-oauth-test-"));
    filePath = join(tempDir, "tokens.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when file does not exist", async () => {
    const storage = new FileStorage(filePath);
    expect(await storage.load()).toBeNull();
  });

  it("saves and loads auth state", async () => {
    const storage = new FileStorage(filePath);
    await storage.save(mockAuth);
    expect(await storage.load()).toEqual(mockAuth);
  });

  it("clears auth state (removes file)", async () => {
    const storage = new FileStorage(filePath);
    await storage.save(mockAuth);
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });

  it("creates parent directories if needed", async () => {
    const deepPath = join(tempDir, "a", "b", "c", "tokens.json");
    const storage = new FileStorage(deepPath);
    await storage.save(mockAuth);
    expect(await storage.load()).toEqual(mockAuth);
  });

  it("clear does not throw if file does not exist", async () => {
    const storage = new FileStorage(filePath);
    await expect(storage.clear()).resolves.toBeUndefined();
  });
});
