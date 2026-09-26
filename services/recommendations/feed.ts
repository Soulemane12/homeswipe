import "server-only";
import { ObjectId } from "mongodb";
import { LEARNING_CONFIG } from "@/lib/config/harness";
import { applyCalibration } from "@/lib/engine/calibration";
import { effectiveConfidence } from "@/lib/engine/preference-state";
import { rankCandidates } from "@/lib/engine/rank";
import type { EngineProperty } from "@/lib/engine/types";
import { db } from "@/lib/mongodb/collections";
import type { PropertyCardData } from "@/models/card";
import type { HarnessExperimentDoc } from "@/models/harness";
import type { PropertyImpressionDoc, RecommendationSessionDoc, RetrievalMode } from "@/models/recommendation";
import { getCalibration } from "@/services/harness/calibration";
import { getActivePolicy } from "@/services/harness/policies";
import { getLiveState } from "@/services/preferences/update";
import { toCard } from "@/services/properties/cards";
import { loadCatalog } from "@/services/properties/repository";
import { getOrCreateUser } from "@/services/users";
import { generateCandidates } from "./candidates";

export interface FeedOptions {
  surface: "discover" | "swipe";
  limit: number;
  excludeIds?: string[];
  simulated?: boolean;
  judge?: boolean;
}

export interface FeedResult {
  sessionId: string;
  policyVersion: number;
  retrievalMode: RetrievalMode;
  items: PropertyCardData[];
  exhausted: boolean;
  explorationTargets: string[];
}

async function getOrCreateSession(userId: string, surface: FeedOptions["surface"], simulated: boolean, policyVersion: number, space: string): Promise<RecommendationSessionDoc> {
  const c = await db();
  const cutoff = new Date(Date.now() - LEARNING_CONFIG.sessionIdleMs);
  const existing = await c.recommendationSessions.findOne(
    { userId, surface, simulated, policyVersion, lastActiveAt: { $gte: cutoff } },
    { sort: { lastActiveAt: -1 } },
  );
  if (existing) return existing;
  const now = new Date();
  const doc: RecommendationSessionDoc = {
    _id: new ObjectId(),
    userId,
    startedAt: now,
    lastActiveAt: now,
    policyVersion,
    surface,
    batches: 0,
    impressions: 0,
    retrievalMode: "in_app_cosine",
    vectorSpace: space,
    generatorCounts: {},
    simulated,
  };
  await c.recommendationSessions.insertOne(doc);
  return doc;
}

/**
 * The main recommendation feed. Every returned property gets a persisted impression carrying
 * the like prediction made *before* the user sees it — the raw material for harness evaluation.
 */
export async function getRecommendations(userId: string, options: FeedOptions): Promise<FeedResult> {
  const c = await db();
  const simulated = options.simulated ?? false;
  const [user, active, catalog] = await Promise.all([getOrCreateUser(userId), getActivePolicy(userId), loadCatalog()]);
  const state = await getLiveState(user, active, catalog);

  const [decided, saved] = await Promise.all([
    c.interactions.distinct("propertyId", { userId, type: { $in: ["like", "dislike", "super_like", "save"] } }),
    c.savedProperties.find({ userId }, { projection: { propertyId: 1, collectionIds: 1 } }).toArray(),
  ]);
  const exclude = new Set<string>([...(decided.filter(Boolean) as string[]), ...saved.map((s) => s.propertyId), ...(options.excludeIds ?? [])]);

  const session = await getOrCreateSession(userId, options.surface, simulated, active.version, catalog.space);
  const batchId = `${session._id.toHexString()}-${session.batches + 1}`;
  const pool = await generateCandidates({ user, policy: active.policy, catalog, state, exclude, savedIds: saved.map((s) => s.propertyId), seed: batchId });

  const candidates = [...pool.sources.keys()].map((id) => catalog.byId.get(id)).filter((p): p is EngineProperty => p !== undefined);
  const ranked = rankCandidates({
    candidates,
    ctx: { state, policy: active.policy, stats: catalog.stats, constraints: user.constraints, properties: catalog.byId, now: new Date() },
    limit: options.limit,
    seed: batchId,
  });
  if (ranked.constraintViolations > 0) console.warn(`[feed] dropped ${ranked.constraintViolations} candidates violating hard constraints`);

  const calibration = await getCalibration(userId, active.version, simulated);
  const shownAt = new Date();
  const impressions: PropertyImpressionDoc[] = ranked.items.map((item) => ({
    _id: new ObjectId(),
    userId,
    propertyId: item.scored.propertyId,
    recommendationSessionId: session._id,
    batchId,
    shownAt,
    rank: item.rank,
    surface: options.surface,
    policyVersion: active.version,
    predictedLikeScore: item.predictedLikeScore,
    calibratedLikeProbability: calibration ? applyCalibration(item.predictedLikeScore, calibration) : undefined,
    predictedLabel: item.predictedLabel,
    scoreBreakdown: item.scored.breakdown,
    generators: [...(pool.sources.get(item.scored.propertyId) ?? [])],
    exploration: item.exploration ? { strategy: active.policy.explorationPolicy.strategy, targetDimension: item.targetDimension } : undefined,
    resolved: false,
    simulated,
  }));
  if (impressions.length > 0) await c.propertyImpressions.insertMany(impressions);

  const probes: HarnessExperimentDoc[] = impressions
    .filter((imp) => imp.exploration?.targetDimension)
    .map((imp) => {
      const target = imp.exploration!.targetDimension!;
      const dim = state.dimensions[target];
      return {
        _id: new ObjectId(),
        userId,
        kind: "exploration_probe",
        createdAt: shownAt,
        updatedAt: shownAt,
        simulated,
        impressionId: imp._id,
        propertyId: imp.propertyId,
        targetDimension: target,
        propertyValue: catalog.byId.get(imp.propertyId)?.features[target] ?? 0,
        confidenceBefore: dim ? effectiveConfidence(dim) : 0,
        status: "pending",
      };
    });
  if (probes.length > 0) await c.harnessExperiments.insertMany(probes);

  const generatorCounts: Record<string, number> = {};
  for (const imp of impressions) for (const g of imp.generators) generatorCounts[`generatorCounts.${g}`] = (generatorCounts[`generatorCounts.${g}`] ?? 0) + 1;
  await c.recommendationSessions.updateOne(
    { _id: session._id },
    { $set: { lastActiveAt: shownAt, retrievalMode: pool.retrievalMode }, $inc: { batches: 1, impressions: impressions.length, ...generatorCounts } },
  );

  const items = ranked.items.map((item, i) => {
    const property = catalog.propertyById.get(item.scored.propertyId)!;
    const imp = impressions[i];
    return toCard(property, {
      scored: item.scored,
      impressionId: imp._id.toHexString(),
      judge: options.judge
        ? {
            predictedLikeScore: imp.predictedLikeScore,
            calibratedLikeProbability: imp.calibratedLikeProbability,
            predictedLabel: imp.predictedLabel,
            policyVersion: imp.policyVersion,
            breakdown: imp.scoreBreakdown,
            generators: imp.generators,
            exploration: imp.exploration,
          }
        : undefined,
    });
  });

  return {
    sessionId: session._id.toHexString(),
    policyVersion: active.version,
    retrievalMode: pool.retrievalMode,
    items,
    exhausted: pool.eligibleCount === 0,
    explorationTargets: ranked.targets.map((t) => t.dimension),
  };
}
