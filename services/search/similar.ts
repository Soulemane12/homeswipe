import "server-only";
import { satisfiesHardConstraints } from "@/lib/engine/constraints";
import type { PropertyCardData } from "@/models/card";
import type { RetrievalMode } from "@/models/recommendation";
import { savedPropertyIds } from "@/services/collections";
import { toCard } from "@/services/properties/cards";
import { getPersonalContext } from "@/services/recommendations/personalize";
import { propertyQueryVector, vectorSearch } from "./vector";

/**
 * "Find similar": the anchor home's vector (Voyage embedding or feature vector) retrieves
 * neighbors via Vector Search within the user's hard constraints, then results blend anchor
 * similarity (65%) with the user's learned preference fit (35%).
 */
export async function similarHomes(userId: string, propertyId: string, limit = 12): Promise<{ results: PropertyCardData[]; retrievalMode: RetrievalMode }> {
  const ctx = await getPersonalContext(userId);
  const anchor = ctx.catalog.byId.get(propertyId);
  if (!anchor) return { results: [], retrievalMode: "in_app_cosine" };
  const q = propertyQueryVector(anchor, ctx.catalog);
  const { hits, mode } = await vectorSearch({ ...q, constraints: ctx.user.constraints, limit: limit * 3, catalog: ctx.catalog });
  const saved = await savedPropertyIds(userId);
  const ranked = hits
    .filter((h) => h.id !== propertyId)
    .map((h) => ({ h, p: ctx.catalog.byId.get(h.id) }))
    .filter((x): x is { h: typeof x.h; p: NonNullable<typeof x.p> } => x.p !== undefined && satisfiesHardConstraints(x.p, ctx.user.constraints))
    .map(({ h, p }) => {
      const scored = ctx.scorer.score(p);
      return { p, scored, value: 0.65 * h.score + 0.35 * scored.breakdown.fit };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  return {
    results: ranked.map(({ p, scored }) => toCard(ctx.catalog.propertyById.get(p.id)!, { scored, saved: saved.has(p.id) })),
    retrievalMode: mode,
  };
}
