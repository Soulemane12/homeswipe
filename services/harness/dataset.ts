import "server-only";
import { LEARNING_CONFIG } from "@/lib/config/harness";
import type { ReplayDataset, ReplayExample } from "@/lib/engine/replay";
import { db } from "@/lib/mongodb/collections";
import type { DataScope } from "@/models/harness";
import type { RecommendationPredictionDoc } from "@/models/recommendation";
import { loadInteractionHistory } from "@/services/preferences/history";
import { loadCatalog } from "@/services/properties/repository";
import { getOrCreateUser } from "@/services/users";

export function scopeFilter(scope: DataScope): { simulated?: boolean } {
  if (scope === "real") return { simulated: false };
  if (scope === "simulated") return { simulated: true };
  return {};
}

export function toReplayExample(p: RecommendationPredictionDoc): ReplayExample {
  return {
    id: p._id.toHexString(),
    propertyId: p.propertyId,
    batchId: p.batchId,
    shownAt: p.shownAt,
    resolvedAt: p.resolvedAt,
    actual: p.actualLabel,
    exploration: p.exploration,
    outcomeType: p.outcomeType,
    dwellMs: p.dwellMs ?? undefined,
    simulated: p.simulated,
    policyVersion: p.policyVersion,
  };
}

/**
 * Replay dataset for one user and data scope. Labeled examples are filtered by scope; the
 * interaction history is complete, because that is what the live system actually knew when it
 * made each prediction.
 */
export async function buildReplayDataset(userId: string, scope: DataScope): Promise<{ dataset: ReplayDataset; counts: { real: number; simulated: number } }> {
  const c = await db();
  const [user, catalog, history, predictions] = await Promise.all([
    getOrCreateUser(userId),
    loadCatalog(),
    loadInteractionHistory(userId),
    c.recommendationPredictions.find({ userId, ...scopeFilter(scope) }).sort({ shownAt: 1, rank: 1 }).toArray(),
  ]);
  const examples = predictions.filter((p) => catalog.byId.has(p.propertyId)).map(toReplayExample);
  return {
    dataset: {
      examples,
      interactions: history,
      properties: catalog.byId,
      stats: catalog.stats,
      explicit: user.explicitPreferences,
      constraints: user.constraints,
      space: catalog.space,
      explicitEmbedding: catalog.space !== "local" && user.preferenceProfile?.embeddingModel === catalog.space ? user.preferenceProfile.embedding : undefined,
      batchEvery: LEARNING_CONFIG.preferenceUpdateEvery,
      fitCache: new Map(),
    },
    counts: {
      real: examples.filter((e) => !e.simulated).length,
      simulated: examples.filter((e) => e.simulated).length,
    },
  };
}
