import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { SOURCE_SURFACES } from "@/models/interaction";
import { recordInteraction } from "@/services/interactions/record";
import { similarHomes } from "@/services/search/similar";

const Body = z.object({ propertyId: z.string().min(1), limit: z.number().int().min(1).max(24).default(12), sourceSurface: z.enum(SOURCE_SURFACES).default("property") });

/** POST /api/similar — records a find_similar signal (the anchor's attributes matter) and returns neighbors. */
export const POST = handle(async (request: Request) => {
  const userId = await getCurrentUserId();
  const body = await parseBody(request, Body);
  await recordInteraction(userId, { type: "find_similar", propertyId: body.propertyId, sourceSurface: body.sourceSurface });
  return json(await similarHomes(userId, body.propertyId, body.limit));
});
