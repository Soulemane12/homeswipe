/**
 * Harness evolution and learning thresholds. Values can be overridden through env vars for
 * experimentation; defaults are chosen so promotion decisions rest on a meaningful sample.
 */
function numberFromEnv(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const HARNESS_CONFIG = {
  /** Resolved predictions required before any evolution run is attempted. */
  minResolvedForEvolution: numberFromEnv("HARNESS_MIN_RESOLVED", 30),
  /** Minimum holdout examples; the holdout is the newest max(this, holdoutFraction·n). */
  minHoldoutExamples: numberFromEnv("HARNESS_MIN_HOLDOUT", 10),
  holdoutFraction: 0.3,
  /** Candidate must beat current holdout accuracy by at least this much. */
  minAccuracyDelta: numberFromEnv("HARNESS_MIN_ACCURACY_DELTA", 0.03),
  /** Allowed balanced-accuracy regression when accuracy improves. */
  maxBalancedAccuracyRegression: 0.02,
  /** Allowed top-N like-rate regression. */
  maxTopNLikeRateRegression: 0.1,
  /** Automatic evolution runs after this many new real resolved predictions. */
  autoEvolveEvery: numberFromEnv("HARNESS_AUTO_EVOLVE_EVERY", 10),
  /** Top-N used for "top recommendation like rate". */
  topN: 3,
  /** Minimum resolved predictions under one policy version before fitting calibration. */
  minResolvedForCalibration: 30,
  /** Evolution lock lease. */
  lockMs: 60_000,
} as const;

export const LEARNING_CONFIG = {
  /** Batched preference update after this many meaningful interactions. */
  preferenceUpdateEvery: numberFromEnv("PREFERENCE_UPDATE_EVERY", 4),
  /** A new recommendation session starts after this much inactivity. */
  sessionIdleMs: 30 * 60 * 1000,
  /** L2 penalty of the per-user preference regression (shrinks noise dimensions toward 0). */
  regularization: 1.5,
  /** strength = tanh(coefficient / strengthScale), mapping regression coefficients to [-1, 1]. */
  strengthScale: 3,
  /** confidence = 1 − exp(−FisherInformation / confidenceScale). */
  confidenceScale: 0.5,
  /** Minimum samples in the recent window before a separate recent model is fit. */
  minRecentSamples: 4,
  /** Minimum |centered feature| for an interaction to count as evidence on a dimension. */
  evidenceThreshold: 0.2,
  /** Confidence assigned to explicit user corrections (outweighs inferred signals). */
  correctionConfidence: 0.95,
  onboardingConfidence: 0.8,
} as const;
