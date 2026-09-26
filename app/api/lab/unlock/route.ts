import { z } from "zod";
import { lockLabAdmin, unlockLabAdmin } from "@/lib/auth/lab-admin";
import { errorResponse, handle, json, parseBody } from "@/lib/http/route";

const Body = z.object({ secret: z.string().min(1).max(512) });

/** POST /api/lab/unlock — verify the operator secret; sets an httpOnly token cookie (never the secret). */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  const result = await unlockLabAdmin(body.secret);
  if (!result.ok) return errorResponse(result.status, result.reason);
  return json({ ok: true });
});

/** DELETE /api/lab/unlock — lock operator actions again. */
export const DELETE = handle(async () => {
  await lockLabAdmin();
  return json({ ok: true });
});
