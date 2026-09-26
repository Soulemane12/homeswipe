import "server-only";
import { HARNESS_CONFIG } from "@/lib/config/harness";
import { computeMetrics, type Metrics } from "@/lib/engine/metrics";
import { parsePolicy } from "@/lib/engine/policy-schema";
import { replayPolicy } from "@/lib/engine/replay";
import { db } from "@/lib/mongodb/collections";
import type { DataScope } from "@/models/harness";
import { buildReplayDataset, scopeFilter } from "./dataset";
import { listPolicies } from "./policies";

export interface VersionLiveMetrics {
  version: number;
  status: string;
  metrics: Metrics;
}

/** Live accuracy per policy version: predictions made by that version, as actually resolved. */
export async function liveMetricsByVersion(userId: string, scope: DataScope): Promise<VersionLiveMetrics[]> {
  const c = await db();
  const [policies, predictions] = await Promise.all([
    listPolicies(userId),
    c.recommendationPredictions.find({ userId, ...scopeFilter(scope) }).sort({ shownAt: 1 }).toArray(),
  ]);
  return policies
    .filter((p) => p.status !== "rejected")
    .map((p) => {
      const rows = predictions
        .filter((r) => r.policyVersion === p.version)
        .map((r) => ({
          predicted: r.predictedLabel,
          actual: r.actualLabel,
          score: r.predictedLikeScore,
          batchId: r.batchId,
          rank: r.rank,
          exploration: r.exploration,
          outcomeType: r.outcomeType,
          dwellMs: r.dwellMs,
        }));
      return { version: p.version, status: p.status, metrics: computeMetrics(rows, HARNESS_CONFIG.topN) };
    });
}

export interface SameDataComparison {
  window: { from: Date; to: Date; n: number } | null;
  versions: { version: number; status: string; metrics: Metrics }[];
}

/**
 * Fair comparison: every non-rejected policy version replayed on the same most recent window
 * of resolved predictions. Live per-version accuracy is confounded by what each version was
 * shown (inventory gets harder as the best homes are seen); this removes that confound.
 */
export async function compareVersionsOnSameData(userId: string, scope: DataScope, windowSize = 30): Promise<SameDataComparison> {
  const [{ dataset }, policies] = await Promise.all([buildReplayDataset(userId, scope), listPolicies(userId)]);
  const window = dataset.examples.slice(-windowSize);
  if (window.length === 0) return { window: null, versions: [] };
  const versions = policies
    .filter((p) => p.status !== "rejected")
    .map((p) => ({
      version: p.version,
      status: p.status,
      metrics: computeMetrics(replayPolicy(dataset, parsePolicy(p.policy), { examples: window }), HARNESS_CONFIG.topN),
    }));
  return { window: { from: window[0].shownAt, to: window[window.length - 1].shownAt, n: window.length }, versions };
}

export interface ScopeTotals {
  interactions: number;
  resolved: number;
  correct: number;
  real: { interactions: number; resolved: number };
  simulated: { interactions: number; resolved: number };
}

export async function scopeTotals(userId: string): Promise<ScopeTotals> {
  const c = await db();
  const [ri, si, rr, sr, correct] = await Promise.all([
    c.interactions.countDocuments({ userId, simulated: false }),
    c.interactions.countDocuments({ userId, simulated: true }),
    c.recommendationPredictions.countDocuments({ userId, simulated: false }),
    c.recommendationPredictions.countDocuments({ userId, simulated: true }),
    c.recommendationPredictions.countDocuments({ userId, correct: true }),
  ]);
  return {
    interactions: ri + si,
    resolved: rr + sr,
    correct,
    real: { interactions: ri, resolved: rr },
    simulated: { interactions: si, resolved: sr },
  };
}
