import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { runEvolution } from "@/services/harness/run-evolution";

export const maxDuration = 120;

const Body = z.object({ scope: z.enum(["real", "simulated", "combined"]).default("real") });

/** POST /api/harness/evaluate — run one evaluate → propose → backtest → promote/reject cycle. */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  return json(await runEvolution(await getCurrentUserId(), { trigger: "manual", scope: body.scope }));
});
