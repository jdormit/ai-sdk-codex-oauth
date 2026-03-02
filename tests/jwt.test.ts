import { describe, it, expect } from "vitest";
import { decodeJwtPayload, extractAccountId } from "../src/oauth/jwt.js";

// Helper: create a minimal JWT with a given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe("decodeJwtPayload", () => {
  it("decodes a valid JWT payload", () => {
    const token = makeJwt({ sub: "user123", name: "Test" });
    const result = decodeJwtPayload(token);
    expect(result).toEqual({ sub: "user123", name: "Test" });
  });

  it("returns null for a malformed token (no dots)", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });

  it("returns null for a token with only 2 parts", () => {
    expect(decodeJwtPayload("header.body")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(decodeJwtPayload("a.!!!invalid!!!.c")).toBeNull();
  });

  it("handles base64url encoding (- and _ characters)", () => {
    // Create a payload that would produce + and / in standard base64
    const payload = { data: "test+value/here=now" };
    const json = JSON.stringify(payload);
    const base64url = btoa(json).replace(/\+/g, "-").replace(/\//g, "_");
    const token = `header.${base64url}.sig`;
    const result = decodeJwtPayload(token);
    expect(result).toEqual(payload);
  });
});

describe("extractAccountId", () => {
  it("extracts from direct chatgpt_account_id claim in id_token", () => {
    const idToken = makeJwt({ chatgpt_account_id: "acct-123" });
    const accessToken = makeJwt({ sub: "user" });
    expect(extractAccountId({ id_token: idToken, access_token: accessToken }))
      .toBe("acct-123");
  });

  it("extracts from nested auth claim", () => {
    const token = makeJwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-456" },
    });
    expect(extractAccountId({ access_token: token })).toBe("acct-456");
  });

  it("extracts from first organization ID", () => {
    const token = makeJwt({
      organizations: [{ id: "org-789" }, { id: "org-other" }],
    });
    expect(extractAccountId({ access_token: token })).toBe("org-789");
  });

  it("prefers id_token over access_token", () => {
    const idToken = makeJwt({ chatgpt_account_id: "from-id-token" });
    const accessToken = makeJwt({ chatgpt_account_id: "from-access-token" });
    expect(
      extractAccountId({ id_token: idToken, access_token: accessToken }),
    ).toBe("from-id-token");
  });

  it("falls back to access_token if id_token has no account ID", () => {
    const idToken = makeJwt({ sub: "user" });
    const accessToken = makeJwt({ chatgpt_account_id: "from-access" });
    expect(
      extractAccountId({ id_token: idToken, access_token: accessToken }),
    ).toBe("from-access");
  });

  it("returns undefined when no account ID is found", () => {
    const token = makeJwt({ sub: "user", email: "test@test.com" });
    expect(extractAccountId({ access_token: token })).toBeUndefined();
  });

  it("returns undefined for malformed tokens", () => {
    expect(extractAccountId({ access_token: "not-a-jwt" })).toBeUndefined();
  });
});
