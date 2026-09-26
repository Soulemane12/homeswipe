import "server-only";
import { HARNESS_CONFIG } from "@/lib/config/harness";
import type { Calibration } from "@/lib/engine/calibration";
import { computeMetrics, type Metrics } from "@/lib/engine/metrics";
import { effectiveStrength } from "@/lib/engine/preference-state";
import { selectExplorationTargets } from "@/lib/engine/exploration";
import { dimensionLabel } from "@/lib/features/dimensions";
import { featureFlags } from "@/lib/env";
import { db } from "@/lib/mongodb/collections";
import { listVectorIndexStatus, type SearchIndexStatus } from "@/lib/mongodb/indexes";
import { HIDDEN_PROFILES } from "@/lib/simulation/hidden-profiles";
import type { DataScope, EvaluationRunDoc, HarnessPolicyDoc } from "@/models/harness";
import type { RetrievalMode } from "@/models/recommendation";
import { getPersonalContext } from "@/services/recommendations/personalize";
import { getCalibration } from "./calibration";
import { scopeFilter } from "./dataset";
import { compareVersionsOnSameData, liveMetricsByVersion, scopeTotals, type SameDataComparison, type ScopeTotals, type VersionLiveMetrics } from "./evaluate-policy";
import { listPolicies } from "./policies";

export interface LabPrediction {
  id: string;
  propertyId: string;
  headline: string;
  predictedLikeScore: number;
  calibratedLikeProbability?: number;
  predictedLabel: string;
  actualLabel: string;
  correct: boolean;
  policyVersion: number;
  simulated: boolean;
  exploration: boolean;
  resolvedAt: Date;
}

export interface LabOverview {
  scope: DataScope;
  activeVersion: number;
  activePolicy: HarnessPolicyDoc["policy"];
  totals: ScopeTotals;
  scopedResolved: number;
  activeMetrics: Metrics;
  overallMetrics: Metrics;
  live: VersionLiveMetrics[];
  comparison: SameDataComparison;
  policies: HarnessPolicyDoc[];
  runs: EvaluationRunDoc[];
  strongest: { label: string; strength: number }[];
  explorationTarget: string | null;
  lastChange: { version: number; reason: string; createdAt: Date } | null;
  recentPredictions: LabPrediction[];
  calibration: Calibration | null;
  flags: ReturnType<typeof featureFlags>;
  retrievalMode: RetrievalMode | null;
  vectorIndexes: SearchIndexStatus[];
  hiddenProfiles: { key: string; label: string; description: string }[];
  config: { minResolved: number; minHoldout: number; minAccuracyDelta: number; autoEvolveEvery: number };
}

/** Everything /lab shows, computed from MongoDB documents for one data scope. */
export async function getLabOverview(userId: string, scope: DataScope): Promise<LabOverview> {
  const c = await db();
  const ctx = await getPersonalContext(userId);
  const scopeQuery = { userId, ...scopeFilter(scope) };
  const [policies, runs, predictions, totals, live, comparison, lastSession, vectorIndexes] = await Promise.all([
    listPolicies(userId),
    c.evaluationRuns.find({ userId }).sort({ createdAt: -1 }).limit(15).project<EvaluationRunDoc>({ failureReport: 0 }).toArray(),
    c.recommendationPredictions.find(scopeQuery).sort({ resolvedAt: -1 }).toArray(),
    scopeTotals(userId),
    liveMetricsByVersion(userId, scope),
    compareVersionsOnSameData(userId, scope),
    c.recommendationSessions.find({ userId }).sort({ lastActiveAt: -1 }).limit(1).next(),
    listVectorIndexStatus().catch(() => [] as SearchIndexStatus[]),
  ]);

  const toRow = (p: (typeof predictions)[number]) => ({
    predicted: p.predictedLabel,
    actual: p.actualLabel,
    score: p.predictedLikeScore,
    batchId: p.batchId,
    rank: p.rank,
    exploration: p.exploration,
    outcomeType: p.outcomeType,
    dwellMs: p.dwellMs,
  });
  const chronological = [...predictions].reverse();
  const activeMetrics = computeMetrics(chronological.filter((p) => p.policyVersion === ctx.policyVersion).map(toRow), HARNESS_CONFIG.topN);
  const overallMetrics = computeMetrics(chronological.map(toRow), HARNESS_CONFIG.topN);

  const strongest = Object.values(ctx.state.dimensions)
    .map((d) => ({ label: dimensionLabel(d.key), strength: effectiveStrength(d, ctx.policy.memoryPolicy), confidence: d.confidence }))
    .filter((d) => d.strength > 0.15)
    .sort((a, b) => b.strength * (0.5 + b.confidence / 2) - a.strength * (0.5 + a.confidence / 2))
    .slice(0, 4)
    .map(({ label, strength }) => ({ label, strength }));
  const [target] = selectExplorationTargets(ctx.state, ctx.catalog.stats, ctx.policy, 1);
  const lastPromoted = [...policies].reverse().find((p) => p.createdBy !== "seed" && (p.status === "active" || p.status === "retired"));
  const calibration = scope === "combined" ? null : await getCalibration(userId, ctx.policyVersion, scope === "simulated");

  return {
    scope,
    activeVersion: ctx.policyVersion,
    activePolicy: ctx.policy,
    totals,
    scopedResolved: predictions.length,
    activeMetrics,
    overallMetrics,
    live,
    comparison,
    policies,
    runs,
    strongest,
    explorationTarget: target ? dimensionLabel(target.dimension) : null,
    lastChange: lastPromoted ? { version: lastPromoted.version, reason: lastPromoted.reason, createdAt: lastPromoted.createdAt } : null,
    recentPredictions: predictions.slice(0, 15).map((p) => ({
      id: p._id.toHexString(),
      propertyId: p.propertyId,
      headline: ctx.catalog.propertyById.get(p.propertyId)?.headline ?? p.propertyId,
      predictedLikeScore: p.predictedLikeScore,
      calibratedLikeProbability: p.calibratedLikeProbability,
      predictedLabel: p.predictedLabel,
      actualLabel: p.actualLabel,
      correct: p.correct,
      policyVersion: p.policyVersion,
      simulated: p.simulated,
      exploration: p.exploration,
      resolvedAt: p.resolvedAt,
    })),
    calibration,
    flags: featureFlags(),
    retrievalMode: lastSession?.retrievalMode ?? null,
    vectorIndexes,
    hiddenProfiles: HIDDEN_PROFILES.map((p) => ({ key: p.key, label: p.label, description: p.description })),
    config: {
      minResolved: HARNESS_CONFIG.minResolvedForEvolution,
      minHoldout: HARNESS_CONFIG.minHoldoutExamples,
      minAccuracyDelta: HARNESS_CONFIG.minAccuracyDelta,
      autoEvolveEvery: HARNESS_CONFIG.autoEvolveEvery,
    },
  };
}
