import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json } from "@/lib/http/route";
import { DATA_SCOPES } from "@/models/harness";
import { getLabOverview } from "@/services/harness/overview";

const Query = z.object({ scope: z.enum(DATA_SCOPES as ["real", "simulated", "combined"]).default("real") });

/** GET /api/harness?scope=real|simulated|combined — policy history, metrics and experiments. */
export const GET = handle(async (request: Request) => {
  const q = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json(await getLabOverview(await getCurrentUserId(), q.scope));
});
