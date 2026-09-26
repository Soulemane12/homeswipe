import "server-only";
import { satisfiesHardConstraints } from "@/lib/engine/constraints";
import { db } from "@/lib/mongodb/collections";
import { getHiddenProfile, simulateDecision } from "@/lib/simulation/hidden-profiles";
import { createRng, hashString } from "@/lib/utils/prng";
import { recordInteraction } from "@/services/interactions/record";
import { updatePreferences } from "@/services/preferences/update";
import { loadCatalog } from "@/services/properties/repository";
import { getRecommendations } from "@/services/recommendations/feed";

export interface SimulationSummary {
  profile: string;
  requested: number;
  recorded: number;
  likes: number;
  dislikes: number;
  resolved: number;
  correct: number;
  exhausted: boolean;
  /** Unseen homes still inside the user's criteria — when this runs low, outcomes skew one-sided. */
  remainingEligible: number;
}

/**
 * Drives the real pipeline with a synthetic hidden-preference user: real feed requests (real
 * impressions + predictions), real interaction recording, real batched preference updates.
 * Everything is tagged `simulated: true` and excluded from "Real" metrics by default.
 */
export async function simulateInteractions(userId: string, profileKey: string, count: number): Promise<SimulationSummary> {
  const profile = getHiddenProfile(profileKey);
  if (!profile) throw new Error(`Unknown hidden profile ${profileKey}`);
  const c = await db();
  const catalog = await loadCatalog();
  let step = await c.interactions.countDocuments({ userId, simulated: true, "metadata.hiddenProfile": profile.key });
  const rng = createRng(hashString(`${userId}:${profile.key}:${step}`));
  const summary: SimulationSummary = { profile: profile.key, requested: count, recorded: 0, likes: 0, dislikes: 0, resolved: 0, correct: 0, exhausted: false, remainingEligible: 0 };

  while (summary.recorded < count) {
    const feed = await getRecommendations(userId, { surface: "swipe", limit: Math.min(5, count - summary.recorded), simulated: true });
    if (feed.items.length === 0) {
      summary.exhausted = true;
      break;
    }
    for (const item of feed.items) {
      const property = catalog.byId.get(item.id);
      if (!property) continue;
      const decision = simulateDecision(profile, property, catalog.stats, step, rng);
      const result = await recordInteraction(
        userId,
        {
          propertyId: item.id,
          type: decision.type,
          impressionId: item.impressionId,
          dwellMs: decision.dwellMs,
          sourceSurface: "simulation",
          metadata: { hiddenProfile: profile.key },
        },
        { simulated: true },
      );
      step++;
      summary.recorded++;
      if (decision.type === "dislike") summary.dislikes++;
      else summary.likes++;
      if (result.resolved) {
        summary.resolved++;
        if (result.resolved.correct) summary.correct++;
      }
      if (result.preferenceUpdateDue) await updatePreferences(userId);
    }
  }
  const user = await c.users.findOne({ _id: userId });
  const decided = new Set((await c.interactions.distinct("propertyId", { userId, type: { $in: ["like", "dislike", "super_like", "save"] } })).filter(Boolean) as string[]);
  summary.remainingEligible = user ? catalog.engine.filter((p) => !decided.has(p.id) && satisfiesHardConstraints(p, user.constraints)).length : 0;
  return summary;
}
