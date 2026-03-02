/**
 * Minimal JWT decoding (no signature verification).
 * Works in both browser (atob) and Node.js 16+ (Buffer).
 */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1]!
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    let json: string;
    if (typeof atob === "function") {
      json = atob(base64);
    } else {
      // Node.js fallback
      json = Buffer.from(base64, "base64").toString("utf-8");
    }

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract a ChatGPT account ID from JWT claims.
 * Checks multiple known claim locations in order.
 */
export function extractAccountId(tokens: {
  id_token?: string;
  access_token: string;
}): string | undefined {
  // Try id_token first, then access_token
  const tokensToCheck = [tokens.id_token, tokens.access_token].filter(
    Boolean,
  ) as string[];

  for (const token of tokensToCheck) {
    const claims = decodeJwtPayload(token);
    if (!claims) continue;

    // Location 1: direct claim
    if (typeof claims.chatgpt_account_id === "string") {
      return claims.chatgpt_account_id;
    }

    // Location 2: nested under https://api.openai.com/auth
    const authClaims = claims["https://api.openai.com/auth"] as
      | Record<string, unknown>
      | undefined;
    if (
      authClaims &&
      typeof authClaims.chatgpt_account_id === "string"
    ) {
      return authClaims.chatgpt_account_id;
    }

    // Location 3: first organization ID
    const orgs = claims.organizations as
      | Array<{ id?: string }>
      | undefined;
    if (Array.isArray(orgs) && orgs.length > 0 && typeof orgs[0]?.id === "string") {
      return orgs[0].id;
    }
  }

  return undefined;
}
