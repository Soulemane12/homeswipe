import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { compareProperties } from "@/services/compare";

const Body = z.object({ ids: z.array(z.string()).min(2).max(4), polish: z.boolean().default(false) });

/** POST /api/compare — side-by-side facts plus a preference-aware comparison. */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  return json(await compareProperties(await getCurrentUserId(), body.ids, { polish: body.polish }));
});
