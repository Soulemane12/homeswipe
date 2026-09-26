import type { Metrics } from "./metrics";

export interface PromotionConfig {
  minResolvedForEvolution: number;
  minHoldoutExamples: number;
  minHoldoutPerOutcome: number;
  minAccuracyDelta: number;
  maxBalancedAccuracyRegression: number;
  maxTopNLikeRateRegression: number;
}

export interface PromotionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PromotionDecision {
  promote: boolean;
  checks: PromotionCheck[];
  reason: string;
}

export interface PairedOutcome {
  /** Holdout examples the candidate got right and the current policy got wrong. */
  candidateOnlyCorrect: number;
  currentOnlyCorrect: number;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Promotion gate. A candidate replaces the active policy only when there is enough evidence,
 * it beats the current policy on the held-out (newest) examples by a real margin, wins more
 * paired disagreements than it loses, and does not regress balanced accuracy or top-N quality.
 */
export function decidePromotion(input: {
  totalResolved: number;
  current: Metrics;
  candidate: Metrics;
  paired: PairedOutcome;
  config: PromotionConfig;
}): PromotionDecision {
  const { current, candidate, paired, config } = input;
  const delta = candidate.accuracy - current.accuracy;
  const checks: PromotionCheck[] = [
    {
      name: "enough_evidence",
      passed: input.totalResolved >= config.minResolvedForEvolution,
      detail: `${input.totalResolved} resolved predictions (minimum ${config.minResolvedForEvolution})`,
    },
    {
      name: "enough_holdout",
      passed: candidate.n >= config.minHoldoutExamples,
      detail: `${candidate.n} holdout examples (minimum ${config.minHoldoutExamples})`,
    },
    {
      name: "both_outcomes_in_holdout",
      passed: candidate.likes >= config.minHoldoutPerOutcome && candidate.dislikes >= config.minHoldoutPerOutcome,
      detail: `holdout has ${candidate.likes} likes and ${candidate.dislikes} dislikes (need ≥${config.minHoldoutPerOutcome} of each; a one-sided holdout can't show improvement)`,
    },
    {
      name: "accuracy_gain",
      passed: delta >= config.minAccuracyDelta - 1e-9,
      detail: `holdout accuracy ${pct(current.accuracy)} → ${pct(candidate.accuracy)} (Δ ${delta >= 0 ? "+" : ""}${pct(delta)}, need ≥ +${pct(config.minAccuracyDelta)})`,
    },
    {
      name: "paired_wins",
      passed: paired.candidateOnlyCorrect > paired.currentOnlyCorrect,
      detail: `candidate-only correct ${paired.candidateOnlyCorrect} vs current-only correct ${paired.currentOnlyCorrect}`,
    },
    {
      name: "balanced_accuracy",
      passed: candidate.balancedAccuracy >= current.balancedAccuracy - config.maxBalancedAccuracyRegression - 1e-9,
      detail: `balanced accuracy ${pct(current.balancedAccuracy)} → ${pct(candidate.balancedAccuracy)}`,
    },
    {
      name: "top_n_like_rate",
      passed: candidate.topNLikeRate >= current.topNLikeRate - config.maxTopNLikeRateRegression - 1e-9,
      detail: `top-N like rate ${pct(current.topNLikeRate)} → ${pct(candidate.topNLikeRate)}`,
    },
  ];
  const failed = checks.filter((c) => !c.passed);
  return {
    promote: failed.length === 0,
    checks,
    reason:
      failed.length === 0
        ? `Promoted: ${checks.find((c) => c.name === "accuracy_gain")!.detail}.`
        : `Rejected: ${failed.map((c) => c.detail).join("; ")}.`,
  };
}

export function pairedOutcome(current: { predicted: string; actual: string }[], candidate: { predicted: string; actual: string }[]): PairedOutcome {
  let candidateOnlyCorrect = 0;
  let currentOnlyCorrect = 0;
  const n = Math.min(current.length, candidate.length);
  for (let i = 0; i < n; i++) {
    const a = current[i].predicted === current[i].actual;
    const b = candidate[i].predicted === candidate[i].actual;
    if (b && !a) candidateOnlyCorrect++;
    if (a && !b) currentOnlyCorrect++;
  }
  return { candidateOnlyCorrect, currentOnlyCorrect };
}
