import { z } from "zod";
import { requireLabAdmin } from "@/lib/auth/lab-admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { demoToolsEnabled } from "@/lib/env";
import { errorResponse, handle, json, parseBody } from "@/lib/http/route";
import { simulateInteractions } from "@/services/simulation/run";

export const maxDuration = 300;

const Body = z.object({ profile: z.string().default("light_modernist"), count: z.number().int().min(1).max(60).default(30) });

/** POST /api/lab/simulate — operator only (DEMO_ADMIN_SECRET), demo/dev only: synthetic interactions through the real pipeline. */
export const POST = handle(async (request: Request) => {
  const denied = await requireLabAdmin(request);
  if (denied) return denied;
  if (!demoToolsEnabled()) return errorResponse(403, "Simulation is only available in demo mode or development.");
  const body = await parseBody(request, Body);
  return json(await simulateInteractions(await getCurrentUserId(), body.profile, body.count));
});
