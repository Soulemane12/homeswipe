import { HARNESS_CONFIG } from "@/lib/config/harness";
import { RAPID_DISLIKE_MS } from "@/lib/config/signals";
import { wilsonInterval } from "@/lib/utils/math";
import { brierScore } from "./calibration";
import type { Label } from "./types";

export interface OutcomeRow {
  predicted: Label;
  actual: Label;
  score: number;
  batchId?: string;
  /** Ranking score used to order items within a batch (higher = shown earlier). */
  rankScore?: number;
  rank?: number;
  exploration?: boolean;
  outcomeType?: string;
  dwellMs?: number;
}

export interface Metrics {
  n: number;
  correct: number;
  accuracy: number;
  accuracyCI: { low: number; high: number };
  balancedAccuracy: number;
  precision: number;
  recall: number;
  likeRate: number;
  predictedPositiveRate: number;
  topNLikeRate: number;
  topNCount: number;
  saveRate: number;
  rapidRejectionRate: number;
  scoreBrier: number;
  /** Threshold-free ranking quality of the score (0.5 = random, 1 = perfect separation). */
  auc: number;
  explorationCount: number;
  explorationLikeRate: number;
}

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function computeMetrics(rows: OutcomeRow[], topN: number = HARNESS_CONFIG.topN): Metrics {
  const n = rows.length;
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const r of rows) {
    if (r.predicted === "LIKE" && r.actual === "LIKE") tp++;
    else if (r.predicted === "DISLIKE" && r.actual === "DISLIKE") tn++;
    else if (r.predicted === "LIKE") fp++;
    else fn++;
  }
  const correct = tp + tn;
  const likes = tp + fn;
  const dislikes = tn + fp;
  const tpr = ratio(tp, likes);
  const tnr = ratio(tn, dislikes);
  const balancedAccuracy = likes > 0 && dislikes > 0 ? (tpr + tnr) / 2 : ratio(correct, n);

  const batches = new Map<string, OutcomeRow[]>();
  rows.forEach((r, i) => {
    const key = r.batchId ?? `row-${i}`;
    const list = batches.get(key) ?? [];
    list.push(r);
    batches.set(key, list);
  });
  let topCount = 0;
  let topLikes = 0;
  for (const list of batches.values()) {
    const ordered = [...list].sort((a, b) =>
      a.rankScore !== undefined && b.rankScore !== undefined ? b.rankScore - a.rankScore : (a.rank ?? 0) - (b.rank ?? 0),
    );
    for (const r of ordered.slice(0, topN)) {
      topCount++;
      if (r.actual === "LIKE") topLikes++;
    }
  }

  const exploration = rows.filter((r) => r.exploration);
  return {
    n,
    correct,
    accuracy: ratio(correct, n),
    accuracyCI: wilsonInterval(correct, n),
    balancedAccuracy,
    precision: ratio(tp, tp + fp),
    recall: tpr,
    likeRate: ratio(likes, n),
    predictedPositiveRate: ratio(tp + fp, n),
    topNLikeRate: ratio(topLikes, topCount),
    topNCount: topCount,
    saveRate: ratio(rows.filter((r) => r.outcomeType === "save").length, n),
    rapidRejectionRate: ratio(
      rows.filter((r) => r.actual === "DISLIKE" && typeof r.dwellMs === "number" && r.dwellMs < RAPID_DISLIKE_MS).length,
      n,
    ),
    scoreBrier: brierScore(rows.map((r) => ({ p: r.score, liked: r.actual === "LIKE" }))),
    auc: areaUnderCurve(rows.map((r) => r.score), rows.map((r) => r.actual === "LIKE")),
    explorationCount: exploration.length,
    explorationLikeRate: ratio(exploration.filter((r) => r.actual === "LIKE").length, exploration.length),
  };
}

/** Mann–Whitney AUC with tie handling; 0.5 when only one class is present. */
export function areaUnderCurve(scores: number[], positives: boolean[]): number {
  const pairs = scores.map((s, i) => ({ s, pos: positives[i] })).sort((a, b) => a.s - b.s);
  const nPos = pairs.filter((p) => p.pos).length;
  const nNeg = pairs.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  let rankSum = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pairs[k].pos) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export const EMPTY_METRICS: Metrics = computeMetrics([]);
