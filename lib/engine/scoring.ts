import { DIMENSION_KEYS, FEATURE_DIM, getDimension, isVisualDimension } from "@/lib/features/dimensions";
import { clamp, cosine } from "@/lib/utils/math";
import type { HardConstraints } from "@/models/user";
import { centeredFeatures, centeredVector } from "./catalog";
import type { HarnessPolicy } from "./policy-schema";
import { explicitWeights, preferenceWeights } from "./preference-state";
import {
  PREDICTIVE_COMPONENTS,
  RANKING_COMPONENTS,
  type CatalogStats,
  type ComponentScores,
  type EngineProperty,
  type PreferenceState,
  type Reason,
  type ScoreBreakdown,
  type ScoredProperty,
} from "./types";

export interface ScoringContext {
  state: PreferenceState;
  policy: HarnessPolicy;
  stats: CatalogStats;
  constraints: HardConstraints;
  /** Needed to resolve behavior anchors. */
  properties: Map<string, EngineProperty>;
  now: Date;
  /** Uncertain dimensions the exploration engine is currently probing. */
  explorationTargets?: string[];
}

/** Logistic link applied to Σ weight·feature for learned and explicit components. */
const LINK_SCALE = 4;
const FRESHNESS_HALF_LIFE_DAYS = 21;
const VISUAL_MASK = DIMENSION_KEYS.map((k) => isVisualDimension(k));

/**
 * Preference agreement in [0, 1] (0.5 = neutral): the logistic link of the signed sum of
 * preference weights × the property's centered features (optionally restricted to a mask).
 */
function agreement(weights: number[], centered: number[], mask?: boolean[]): number {
  let z = 0;
  for (let i = 0; i < FEATURE_DIM; i++) {
    if (mask && !mask[i]) continue;
    z += weights[i] * centered[i];
  }
  return 1 / (1 + Math.exp(-LINK_SCALE * z));
}

function metadataFit(p: EngineProperty, c: HardConstraints): number {
  const priceFit = c.maxPrice ? clamp(1 - Math.abs(p.price / c.maxPrice - 0.85) / 0.85) : 0.5;
  const bedDelta = p.bedrooms - c.minBedrooms;
  const bedFit = bedDelta === 0 ? 1 : bedDelta === 1 ? 0.75 : 0.45;
  const sizeFit = p.sqft ? clamp(p.sqft / Math.max(1, p.bedrooms) / 900) : 0.5;
  return 0.5 * priceFit + 0.3 * bedFit + 0.2 * sizeFit;
}

function freshness(p: EngineProperty, now: Date): number {
  const days = Math.max(0, (now.getTime() - p.listedAt.getTime()) / 86_400_000);
  return Math.exp((-Math.LN2 * days) / FRESHNESS_HALF_LIFE_DAYS);
}

/** Information value of showing this property for the currently uncertain dimensions. */
export function explorationValue(p: EngineProperty, stats: CatalogStats, targets: string[] | undefined): number {
  if (!targets || targets.length === 0) return 0;
  const centered = centeredFeatures(p, stats);
  let sum = 0;
  for (const key of targets) {
    const idx = DIMENSION_KEYS.indexOf(key);
    if (idx >= 0) sum += clamp(Math.abs(centered[idx]) / 0.5);
  }
  return sum / targets.length;
}

export interface Scorer {
  score(p: EngineProperty): ScoredProperty;
  weights: number[];
}

/** Builds a scorer with per-context precomputation (weights, anchor vectors). */
export function createScorer(ctx: ScoringContext): Scorer {
  const { state, policy, stats } = ctx;
  const weights = preferenceWeights(state, policy);
  const explicit = explicitWeights(state);
  const importance = DIMENSION_KEYS.map((k) => policy.featureImportance[k] ?? 1);
  const explicitScaled = explicit.map((v, i) => v * importance[i]);
  const nonVisualMask = VISUAL_MASK.map((v) => !v);

  const anchorVectors = (anchors: PreferenceState["positiveAnchors"]) =>
    anchors
      .map((a) => {
        const p = ctx.properties.get(a.propertyId);
        return p ? { vector: centeredVector(p, stats, state.space), weight: a.weight } : null;
      })
      .filter((a): a is { vector: number[]; weight: number } => a !== null);
  const positives = anchorVectors(state.positiveAnchors);
  const negatives = anchorVectors(state.negativeAnchors);
  const maxPosWeight = Math.max(1e-6, ...positives.map((a) => a.weight));
  const maxNegWeight = Math.max(1e-6, ...negatives.map((a) => a.weight));

  const rw = policy.rankingWeights;
  const predictiveWeightSum = PREDICTIVE_COMPONENTS.reduce((s, c) => s + rw[c], 0);
  const totalWeightSum = RANKING_COMPONENTS.reduce((s, c) => s + rw[c], 0);

  function score(p: EngineProperty): ScoredProperty {
    const centered = centeredFeatures(p, stats);
    const vector = centeredVector(p, stats, state.space);

    const semantic = state.semanticVector ? clamp(0.5 + 0.5 * cosine(state.semanticVector, vector)) : 0.5;

    let behavior = 0.5;
    if (positives.length > 0 || negatives.length > 0) {
      const pos = positives.reduce((m, a) => Math.max(m, cosine(a.vector, vector) * (a.weight / maxPosWeight)), 0);
      const neg = negatives.reduce((m, a) => Math.max(m, cosine(a.vector, vector) * (a.weight / maxNegWeight)), 0);
      behavior = clamp(0.5 + 0.5 * (pos - 0.6 * policy.memoryPolicy.negativeMemoryWeight * neg));
    }

    const components: ComponentScores = {
      semantic,
      explicit: agreement(explicitScaled, centered),
      inferred: agreement(weights, centered, nonVisualMask),
      visual: agreement(weights, centered, VISUAL_MASK),
      behavior,
      metadata: metadataFit(p, ctx.constraints),
      freshness: freshness(p, ctx.now),
      exploration: explorationValue(p, stats, ctx.explorationTargets),
    };

    const fit =
      predictiveWeightSum > 0
        ? PREDICTIVE_COMPONENTS.reduce((s, c) => s + rw[c] * components[c], 0) / predictiveWeightSum
        : 0.5;
    const total = totalWeightSum > 0 ? RANKING_COMPONENTS.reduce((s, c) => s + rw[c] * components[c], 0) / totalWeightSum : 0.5;

    const breakdown: ScoreBreakdown = { ...components, fit, total };
    const { reasons, tradeoffs } = explain(p, centered, weights);
    return { propertyId: p.id, breakdown, reasons, tradeoffs };
  }

  return { score, weights };
}

/** Top contributing dimensions (reasons) and the most significant mismatches (tradeoffs). */
function explain(p: EngineProperty, centered: number[], weights: number[]): { reasons: Reason[]; tradeoffs: Reason[] } {
  const reasons: Reason[] = [];
  const tradeoffs: Reason[] = [];
  DIMENSION_KEYS.forEach((key, i) => {
    const w = weights[i];
    const value = p.features[key] ?? 0;
    const def = getDimension(key);
    if (!def || Math.abs(w) < 0.08) return;
    const contribution = w * centered[i];
    if (w > 0 && value >= 0.6 && contribution > 0) reasons.push({ dimension: key, text: def.reason, contribution });
    else if (w > 0.15 && value <= 0.25) tradeoffs.push({ dimension: key, text: def.tradeoff, contribution });
    else if (w < -0.15 && value >= 0.6) tradeoffs.push({ dimension: key, text: def.tradeoff, contribution });
    else if (w < -0.15 && value <= 0.2 && contribution > 0) {
      reasons.push({ dimension: key, text: `No ${def.label.toLowerCase()}`, contribution });
    }
  });
  reasons.sort((a, b) => b.contribution - a.contribution);
  tradeoffs.sort((a, b) => a.contribution - b.contribution);
  return { reasons: reasons.slice(0, 4), tradeoffs: tradeoffs.slice(0, 3) };
}
