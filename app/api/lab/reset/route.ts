import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { demoToolsEnabled } from "@/lib/env";
import { errorResponse, handle, json, parseBody } from "@/lib/http/route";
import { resetDemoUser } from "@/services/demo/reset";

const Body = z.object({ keepOnboarding: z.boolean().default(true), confirm: z.literal("RESET") });

/** POST /api/lab/reset — demo/dev only; requires {"confirm":"RESET"}. Properties are preserved. */
export const POST = handle(async (request: Request) => {
  if (!demoToolsEnabled()) return errorResponse(403, "Reset is only available in demo mode or development.");
  const body = await parseBody(request, Body);
  return json({ ok: true, deleted: await resetDemoUser(await getCurrentUserId(), { keepOnboarding: body.keepOnboarding }) });
});
