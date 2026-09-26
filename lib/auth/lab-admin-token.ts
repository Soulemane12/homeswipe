import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Operator authorization for destructive /lab actions. The raw DEMO_ADMIN_SECRET never leaves
 * the server: operators present it once (unlock form or Authorization header) and the browser
 * keeps only an httpOnly HMAC token derived from it. Rotating the secret invalidates tokens.
 */
const TOKEN_CONTEXT = "homeswipe-lab-admin-v1";

export function labAdminToken(secret: string): string {
  return createHmac("sha256", secret).update(TOKEN_CONTEXT).digest("hex");
}

/** Constant-time string comparison (hashes first so length differences don't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type LabAdminCheck = { ok: true } | { ok: false; status: 401 | 403; reason: string };

/**
 * Pure authorization decision. `configuredSecret` absent → actions disabled (403).
 * Accepts either the raw secret (Authorization: Bearer) or the derived cookie token.
 */
export function checkLabAdmin(input: { configuredSecret?: string; bearer?: string | null; cookieToken?: string | null }): LabAdminCheck {
  const secret = input.configuredSecret?.trim();
  if (!secret) return { ok: false, status: 403, reason: "Admin actions are disabled: DEMO_ADMIN_SECRET is not configured on this deployment." };
  if (input.bearer && safeEqual(input.bearer, secret)) return { ok: true };
  if (input.cookieToken && safeEqual(input.cookieToken, labAdminToken(secret))) return { ok: true };
  return { ok: false, status: 401, reason: "Operator unlock required for this action." };
}
