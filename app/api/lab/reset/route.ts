import { z } from "zod";
import { requireLabAdmin } from "@/lib/auth/lab-admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { demoToolsEnabled } from "@/lib/env";
import { errorResponse, handle, json, parseBody } from "@/lib/http/route";
import { resetDemoUser } from "@/services/demo/reset";

const Body = z.object({ keepOnboarding: z.boolean().default(true), confirm: z.literal("RESET") });

/** POST /api/lab/reset — operator only (DEMO_ADMIN_SECRET), demo/dev only; requires {"confirm":"RESET"}. Properties are preserved. */
export const POST = handle(async (request: Request) => {
  const denied = await requireLabAdmin(request);
  if (denied) return denied;
  if (!demoToolsEnabled()) return errorResponse(403, "Reset is only available in demo mode or development.");
  const body = await parseBody(request, Body);
  return json({ ok: true, deleted: await resetDemoUser(await getCurrentUserId(), { keepOnboarding: body.keepOnboarding }) });
});
