import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json } from "@/lib/http/route";
import { savedPropertyIds } from "@/services/collections";
import { toCard } from "@/services/properties/cards";
import { getPersonalContext, scoreIds } from "@/services/recommendations/personalize";

const Query = z.object({ ids: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(60) });

/** GET /api/properties?ids=a,b — personalized cards (no feed impressions are created). */
export const GET = handle(async (request: Request) => {
  const userId = await getCurrentUserId();
  const q = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
  const ctx = await getPersonalContext(userId);
  const ids = q.ids ? q.ids.split(",").filter(Boolean).slice(0, q.limit) : ctx.catalog.properties.slice(0, q.limit).map((p) => p.id);
  const scored = scoreIds(ctx, ids);
  const saved = await savedPropertyIds(userId);
  const cards = ids
    .map((id) => ctx.catalog.propertyById.get(id))
    .filter((p) => p !== undefined)
    .map((p) => toCard(p, { scored: scored.get(p.id), saved: saved.has(p.id) }));
  return json({ properties: cards });
});
