import "server-only";
import { predictLike } from "@/lib/engine/prediction";
import type { ScoreBreakdown } from "@/lib/engine/types";
import { db } from "@/lib/mongodb/collections";
import type { PropertyCardData } from "@/models/card";
import type { Property } from "@/models/property";
import { getPersonalContext } from "@/services/recommendations/personalize";
import { toCard } from "./cards";

export interface PropertyDetail {
  property: Property;
  card: PropertyCardData;
  breakdown: ScoreBreakdown;
  predictedLikeScore: number;
  policyVersion: number;
  saved: boolean;
  collectionIds: string[];
  /** Explicit reaction the user already gave this home, if any. */
  reaction?: "like" | "dislike" | "super_like";
}

export async function getPropertyDetail(userId: string, id: string): Promise<PropertyDetail | null> {
  const ctx = await getPersonalContext(userId);
  const property = ctx.catalog.propertyById.get(id);
  const engine = ctx.catalog.byId.get(id);
  if (!property || !engine) return null;
  const c = await db();
  const [saved, lastReaction] = await Promise.all([
    c.savedProperties.findOne({ userId, propertyId: id }),
    c.interactions.findOne({ userId, propertyId: id, type: { $in: ["like", "dislike", "super_like"] } }, { sort: { createdAt: -1 } }),
  ]);
  const scored = ctx.scorer.score(engine);
  return {
    property,
    card: toCard(property, { scored, saved: Boolean(saved) }),
    breakdown: scored.breakdown,
    predictedLikeScore: predictLike(scored.breakdown.fit, ctx.policy.prediction).predictedLikeScore,
    policyVersion: ctx.policyVersion,
    saved: Boolean(saved),
    collectionIds: saved?.collectionIds.map((x) => x.toHexString()) ?? [],
    reaction: lastReaction?.type as PropertyDetail["reaction"],
  };
}
