import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/http/route";
import { checkLabAdmin, labAdminToken, safeEqual } from "./lab-admin-token";

export const LAB_ADMIN_COOKIE = "hs_lab_admin";
const MAX_AGE_SECONDS = 8 * 3600;

export function labAdminConfigured(): boolean {
  return Boolean(env().DEMO_ADMIN_SECRET?.trim());
}

/** Whether the current request carries a valid operator unlock (cookie). */
export async function isLabAdmin(): Promise<boolean> {
  const store = await cookies();
  return checkLabAdmin({ configuredSecret: env().DEMO_ADMIN_SECRET, cookieToken: store.get(LAB_ADMIN_COOKIE)?.value }).ok;
}

/** Guard for destructive route handlers; returns an error Response, or null when authorized. */
export async function requireLabAdmin(request: Request): Promise<Response | null> {
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const store = await cookies();
  const result = checkLabAdmin({ configuredSecret: env().DEMO_ADMIN_SECRET, bearer, cookieToken: store.get(LAB_ADMIN_COOKIE)?.value });
  return result.ok ? null : errorResponse(result.status, result.reason);
}

/** Verifies the presented secret and stores only the derived token in an httpOnly cookie. */
export async function unlockLabAdmin(presented: string): Promise<{ ok: true } | { ok: false; status: 401 | 403; reason: string }> {
  const secret = env().DEMO_ADMIN_SECRET?.trim();
  if (!secret) return { ok: false, status: 403, reason: "Admin actions are disabled on this deployment." };
  if (!safeEqual(presented, secret)) return { ok: false, status: 401, reason: "Incorrect admin secret." };
  const store = await cookies();
  store.set(LAB_ADMIN_COOKIE, labAdminToken(secret), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return { ok: true };
}

export async function lockLabAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(LAB_ADMIN_COOKIE);
}
