import { z } from "zod";
import { requireLabAdmin } from "@/lib/auth/lab-admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { runEvolution } from "@/services/harness/run-evolution";

export const maxDuration = 120;

const Body = z.object({ scope: z.enum(["real", "simulated", "combined"]).default("real") });

/** POST /api/harness/evaluate — operator only (DEMO_ADMIN_SECRET): one evaluate → propose → backtest → promote/reject cycle. */
export const POST = handle(async (request: Request) => {
  const denied = await requireLabAdmin(request);
  if (denied) return denied;
  const body = await parseBody(request, Body);
  return json(await runEvolution(await getCurrentUserId(), { trigger: "manual", scope: body.scope }));
});
