import { LEARNING_CONFIG } from "@/lib/config/harness";
import { SIGNAL_STRENGTH, interactionSignal } from "@/lib/config/signals";
import { DIMENSION_KEYS, FEATURE_DIM, dimensionIndex } from "@/lib/features/dimensions";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { addScaled, normalize } from "@/lib/utils/math";
import { centeredFeatures, centeredVector } from "./catalog";
import { fitLogistic, type LogisticFit } from "./logistic";
import type { HarnessPolicy } from "./policy-schema";
import type {
  Anchor,
  CatalogStats,
  CorrectionStance,
  DimensionState,
  EngineInteraction,
  EngineProperty,
  PreferenceDirection,
  PreferenceState,
  VectorSpace,
} from "./types";

type MemoryPolicy = HarnessPolicy["memoryPolicy"];

export interface ExplicitInput {
  positive: string[];
  negative: string[];
}

export interface BuildStateInput {
  /** Interactions strictly before the moment being scored, in chronological order. */
  interactions: EngineInteraction[];
  properties: Map<string, EngineProperty>;
  stats: CatalogStats;
  memoryPolicy: MemoryPolicy;
  explicit: ExplicitInput;
  space: VectorSpace;
  /** Raw embedding of the user's explicit preference text, when using an embedding space. */
  explicitEmbedding?: number[];
  /** Shared cache of regression fits keyed by history prefix (replay evaluates many policies). */
  fitCache?: Map<string, LogisticFit>;
}

const MAX_EVIDENCE_IDS = 12;
const MAX_ANCHORS = 20;

export function stanceValue(stance: CorrectionStance, direction: PreferenceDirection): number {
  const sign = direction === "positive" ? 1 : -1;
  if (stance === "important") return 0.9 * sign;
  if (stance === "neutral") return 0.35 * sign;
  return 0;
}

function emptyDimension(key: string): DimensionState {
  return {
    key,
    longTerm: 0,
    recent: 0,
    confidence: 0,
    evidenceCount: 0,
    positiveEvidence: [],
    negativeEvidence: [],
  };
}

function pushLimited(list: string[], id: string): void {
  if (list.includes(id)) return;
  list.push(id);
  if (list.length > MAX_EVIDENCE_IDS) list.shift();
}

/**
 * Builds the learned preference state from interaction history. Pure and deterministic:
 * the live recommender and offline policy replay both call this, so a policy's memory
 * parameters (recency window, recent vs. long-term weight) are genuinely testable.
 */
export function buildPreferenceState(input: BuildStateInput): PreferenceState {
  const { interactions, properties, stats, memoryPolicy, explicit, space } = input;
  const dims: Record<string, DimensionState> = {};
  for (const key of DIMENSION_KEYS) dims[key] = emptyDimension(key);

  // 1. Corrections: explicit overrides + attribution fixes for earlier interactions.
  const overrides = new Map<string, { value: number; stance: CorrectionStance }>();
  const attributionByTarget = new Map<string, Record<string, number>>();
  for (const it of interactions) {
    if (it.type !== "preference_correction") continue;
    for (const c of it.corrections ?? []) {
      if (!isAllowedDimension(c.dimension)) continue;
      overrides.set(c.dimension, { value: stanceValue(c.stance, c.direction), stance: c.stance });
    }
    if (it.targetInteractionId && it.attribution) {
      attributionByTarget.set(it.targetInteractionId, { ...attributionByTarget.get(it.targetInteractionId), ...it.attribution });
    }
  }

  // 2. Evidence from property interactions → weighted logistic regression over centered features.
  const evidence = interactions.filter(
    (it) => it.propertyId && properties.has(it.propertyId) && SIGNAL_STRENGTH[it.type] !== 0,
  );
  const window = memoryPolicy.recentInteractionWindow;
  const recentStart = Math.max(0, evidence.length - window);

  const xs: number[][] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  const positiveAnchors: Anchor[] = [];
  const negativeAnchors: Anchor[] = [];
  const semantic: number[] | null = evidence.length > 0 ? [] : null;
  let semanticInit = false;
  let simulatedCount = 0;

  evidence.forEach((it, idx) => {
    const property = properties.get(it.propertyId!)!;
    const signal = interactionSignal({ type: it.type, dwellMs: it.dwellMs, collectionKind: it.collectionKind });
    const recent = idx >= recentStart;
    const attribution = attributionByTarget.get(it.id) ?? it.attribution;
    const centered = centeredFeatures(property, stats);
    if (it.simulated) simulatedCount++;

    const x = new Array<number>(FEATURE_DIM);
    for (let d = 0; d < FEATURE_DIM; d++) {
      const key = DIMENSION_KEYS[d];
      const factor = attribution?.[key] ?? 1;
      x[d] = centered[d] * factor;
      if (factor !== 0 && Math.abs(centered[d]) >= LEARNING_CONFIG.evidenceThreshold) {
        const state = dims[key];
        state.evidenceCount++;
        state.lastEvidenceAt = it.createdAt;
        pushLimited(signal * centered[d] > 0 ? state.positiveEvidence : state.negativeEvidence, it.id);
      }
    }
    xs.push(x);
    ys.push(signal > 0 ? 1 : 0);
    ws.push(Math.abs(signal));

    const recencyWeight = recent ? memoryPolicy.recentMemoryWeight : memoryPolicy.longTermMemoryWeight;
    const anchorWeight = Math.abs(signal) * recencyWeight;
    if (signal >= 0.3) positiveAnchors.push({ propertyId: property.id, weight: anchorWeight, recent });
    else if (signal < 0) negativeAnchors.push({ propertyId: property.id, weight: anchorWeight, recent });

    if (semantic) {
      const vec = centeredVector(property, stats, space);
      if (!semanticInit) {
        for (let i = 0; i < vec.length; i++) semantic.push(0);
        semanticInit = true;
      }
      const negScale = signal < 0 ? memoryPolicy.negativeMemoryWeight : 1;
      addScaled(semantic, vec, signal * recencyWeight * negScale);
    }
  });

  const prefixKey = `${interactions.length}:${interactions[interactions.length - 1]?.id ?? ""}`;
  const fit = (kind: string, from: number): LogisticFit => {
    const key = `${prefixKey}:${kind}`;
    const cached = input.fitCache?.get(key);
    if (cached) return cached;
    const result = fitLogistic({
      xs: xs.slice(from),
      ys: ys.slice(from),
      weights: ws.slice(from),
      lambda: LEARNING_CONFIG.regularization,
      dim: FEATURE_DIM,
    });
    input.fitCache?.set(key, result);
    return result;
  };
  const longFit = fit("all", 0);
  const recentFit = evidence.length - recentStart >= LEARNING_CONFIG.minRecentSamples ? fit(`recent-${window}`, recentStart) : null;

  for (let d = 0; d < FEATURE_DIM; d++) {
    const state = dims[DIMENSION_KEYS[d]];
    state.longTerm = Math.tanh(longFit.beta[d] / LEARNING_CONFIG.strengthScale);
    state.recent = recentFit ? Math.tanh(recentFit.beta[d] / LEARNING_CONFIG.strengthScale) : state.longTerm;
    state.confidence = 1 - Math.exp(-longFit.information[d] / LEARNING_CONFIG.confidenceScale);
  }

  // 3. Explicit preferences: onboarding answers, overridden by later corrections.
  for (const key of explicit.positive) {
    if (dims[key] && isAllowedDimension(key)) dims[key].explicit = { value: 0.7, source: "onboarding" };
  }
  for (const key of explicit.negative) {
    if (dims[key] && isAllowedDimension(key)) dims[key].explicit = { value: -0.7, source: "onboarding" };
  }
  for (const [key, o] of overrides) {
    if (!dims[key]) dims[key] = emptyDimension(key);
    dims[key].explicit = { value: o.value, source: "correction", stance: o.stance };
  }

  // 4. Fold explicit preferences into the semantic vector so cold-start users still retrieve well.
  let semanticVector = semantic;
  const explicitLocal = explicitLocalVector(dims);
  if (space === "local") {
    if (explicitLocal.some((v) => v !== 0)) {
      semanticVector = semanticVector ?? new Array<number>(FEATURE_DIM).fill(0);
      addScaled(semanticVector, explicitLocal, 1.5);
    }
  } else if (input.explicitEmbedding && stats.embeddingMean) {
    const centered = input.explicitEmbedding.map((v, i) => v - (stats.embeddingMean![i] ?? 0));
    semanticVector = semanticVector ?? new Array<number>(centered.length).fill(0);
    addScaled(semanticVector, normalize(centered), 1.5);
  }

  return {
    dimensions: dims,
    positiveAnchors: positiveAnchors.slice(-MAX_ANCHORS),
    negativeAnchors: negativeAnchors.slice(-MAX_ANCHORS),
    semanticVector: semanticVector && semanticVector.some((v) => v !== 0) ? normalize(semanticVector) : null,
    space,
    interactionCount: interactions.length,
    evidenceCount: evidence.length,
    simulatedCount,
  };
}

function explicitLocalVector(dims: Record<string, DimensionState>): number[] {
  const v = new Array<number>(FEATURE_DIM).fill(0);
  for (const state of Object.values(dims)) {
    const idx = dimensionIndex(state.key);
    if (idx >= 0 && state.explicit) v[idx] = state.explicit.value;
  }
  return v;
}

/** Inferred strength blended by the policy's recent vs. long-term memory weights. */
export function inferredStrength(state: DimensionState, memoryPolicy: MemoryPolicy): number {
  const wR = memoryPolicy.recentMemoryWeight;
  const wL = memoryPolicy.longTermMemoryWeight;
  return (wL * state.longTerm + wR * state.recent) / (wL + wR);
}

/**
 * The value a dimension contributes to ranking. Corrections replace inferred evidence;
 * onboarding answers blend with it; negatives are scaled by the negative-memory weight.
 */
export function effectiveStrength(state: DimensionState, memoryPolicy: MemoryPolicy): number {
  const inferred = inferredStrength(state, memoryPolicy);
  let value: number;
  if (state.explicit?.source === "correction") value = state.explicit.value;
  else if (state.explicit) value = 0.6 * state.explicit.value + 0.4 * inferred;
  else value = inferred;
  return value < 0 ? value * memoryPolicy.negativeMemoryWeight : value;
}

export function effectiveConfidence(state: DimensionState): number {
  if (state.explicit?.source === "correction") return LEARNING_CONFIG.correctionConfidence;
  if (state.explicit) return Math.max(state.confidence, LEARNING_CONFIG.onboardingConfidence);
  return state.confidence;
}

/** Per-dimension ranking weights (strength × importance × confidence) in feature order. */
export function preferenceWeights(state: PreferenceState, policy: HarnessPolicy): number[] {
  const weights = new Array<number>(FEATURE_DIM).fill(0);
  DIMENSION_KEYS.forEach((key, i) => {
    const dim = state.dimensions[key];
    if (!dim) return;
    const importance = policy.featureImportance[key] ?? 1;
    weights[i] = effectiveStrength(dim, policy.memoryPolicy) * importance * (0.4 + 0.6 * effectiveConfidence(dim));
  });
  return weights;
}

/** Explicit-only weights (onboarding + corrections), in feature order. */
export function explicitWeights(state: PreferenceState): number[] {
  return explicitLocalVector(state.dimensions);
}
