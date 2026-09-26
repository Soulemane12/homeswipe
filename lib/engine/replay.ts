import { MEANINGFUL_TYPES } from "@/lib/config/signals";
import type { HardConstraints } from "@/models/user";
import type { LogisticFit } from "./logistic";
import type { OutcomeRow } from "./metrics";
import type { HarnessPolicy } from "./policy-schema";
import { predictLike } from "./prediction";
import { buildPreferenceState, type ExplicitInput } from "./preference-state";
import { createScorer, type Scorer } from "./scoring";
import type {
  CatalogStats,
  EngineInteraction,
  EngineProperty,
  Label,
  PreferenceState,
  ScoreBreakdown,
  VectorSpace,
} from "./types";

export interface ReplayExample {
  id: string;
  propertyId: string;
  batchId: string;
  shownAt: Date;
  resolvedAt: Date;
  actual: Label;
  exploration: boolean;
  outcomeType: string;
  dwellMs?: number;
  simulated: boolean;
  policyVersion: number;
}

export interface ReplayDataset {
  /** Labeled examples sorted by shownAt. */
  examples: ReplayExample[];
  /** Full interaction history sorted by createdAt (including unlabeled signals and corrections). */
  interactions: EngineInteraction[];
  properties: Map<string, EngineProperty>;
  stats: CatalogStats;
  explicit: ExplicitInput;
  constraints: HardConstraints;
  space: VectorSpace;
  explicitEmbedding?: number[];
  /**
   * Live preference memory is updated in batches every N meaningful interactions; replay
   * emulates that lag so offline accuracy matches what the live system could have known.
   */
  batchEvery: number;
  /** Shared regression-fit cache so evaluating many candidate policies stays fast. */
  fitCache?: Map<string, LogisticFit>;
}

export interface ReplayRow extends OutcomeRow {
  example: ReplayExample;
  breakdown: ScoreBreakdown;
  state: PreferenceState;
  weights: number[];
  /** Fit using only recent / only long-term memory (diagnostics for failure analysis). */
  recentOnlyFit?: number;
  longTermOnlyFit?: number;
}

const MEANINGFUL = new Set<string>(MEANINGFUL_TYPES);

/** Index into `interactions` up to which the batched live memory would have been updated. */
export function batchCutoff(interactions: EngineInteraction[], available: number, batchEvery: number): number {
  if (batchEvery <= 1) return available;
  let meaningful = 0;
  for (let i = 0; i < available; i++) if (MEANINGFUL.has(interactions[i].type)) meaningful++;
  const target = Math.floor(meaningful / batchEvery) * batchEvery;
  if (target === meaningful) return available;
  let seen = 0;
  for (let i = 0; i < available; i++) {
    if (MEANINGFUL.has(interactions[i].type)) {
      seen++;
      if (seen === target) return i + 1;
    }
  }
  return 0;
}

interface CacheEntry {
  state: PreferenceState;
  scorer: Scorer;
  recentScorer?: Scorer;
  longTermScorer?: Scorer;
}

/**
 * Prequential replay: each labeled example is scored under `policy` using only the history
 * that existed before it was shown. Deterministic and offline (stored vectors only), so a
 * candidate policy can be compared to the current one on exactly the same examples.
 */
export function replayPolicy(
  dataset: ReplayDataset,
  policy: HarnessPolicy,
  options: { diagnostics?: boolean; examples?: ReplayExample[] } = {},
): ReplayRow[] {
  const examples = options.examples ?? dataset.examples;
  const { interactions } = dataset;
  const cache = new Map<number, CacheEntry>();
  const rows: ReplayRow[] = [];
  let pointer = 0;

  for (const example of examples) {
    while (pointer < interactions.length && interactions[pointer].createdAt < example.shownAt) pointer++;
    // Examples may arrive out of order when a subset is passed; recompute the pointer then.
    if (pointer > 0 && interactions[pointer - 1].createdAt >= example.shownAt) {
      pointer = interactions.findIndex((it) => it.createdAt >= example.shownAt);
      if (pointer < 0) pointer = interactions.length;
    }
    const cutoff = batchCutoff(interactions, pointer, dataset.batchEvery);
    let entry = cache.get(cutoff);
    if (!entry) {
      const history = interactions.slice(0, cutoff);
      const state = buildPreferenceState({
        interactions: history,
        properties: dataset.properties,
        stats: dataset.stats,
        memoryPolicy: policy.memoryPolicy,
        explicit: dataset.explicit,
        space: dataset.space,
        explicitEmbedding: dataset.explicitEmbedding,
        fitCache: dataset.fitCache,
      });
      const base = {
        stats: dataset.stats,
        constraints: dataset.constraints,
        properties: dataset.properties,
        now: example.shownAt,
      };
      entry = { state, scorer: createScorer({ ...base, state, policy }) };
      if (options.diagnostics) {
        const recentPolicy = { ...policy, memoryPolicy: { ...policy.memoryPolicy, recentMemoryWeight: 1, longTermMemoryWeight: 0 } };
        const longPolicy = { ...policy, memoryPolicy: { ...policy.memoryPolicy, recentMemoryWeight: 0, longTermMemoryWeight: 1 } };
        entry.recentScorer = createScorer({ ...base, state, policy: recentPolicy });
        entry.longTermScorer = createScorer({ ...base, state, policy: longPolicy });
      }
      cache.set(cutoff, entry);
    }
    const property = dataset.properties.get(example.propertyId);
    if (!property) continue;
    const scored = entry.scorer.score(property);
    const prediction = predictLike(scored.breakdown.fit, policy.prediction);
    rows.push({
      example,
      breakdown: scored.breakdown,
      state: entry.state,
      weights: entry.scorer.weights,
      predicted: prediction.predictedLabel,
      actual: example.actual,
      score: prediction.predictedLikeScore,
      batchId: example.batchId,
      rankScore: scored.breakdown.total,
      exploration: example.exploration,
      outcomeType: example.outcomeType,
      dwellMs: example.dwellMs,
      recentOnlyFit: entry.recentScorer?.score(property).breakdown.fit,
      longTermOnlyFit: entry.longTermScorer?.score(property).breakdown.fit,
    });
  }
  return rows;
}

/** Chronological split: the newest max(minHoldout, fraction·n) examples form the holdout. */
export function splitTrainHoldout<T>(
  examples: T[],
  options: { holdoutFraction: number; minHoldout: number },
): { training: T[]; holdout: T[] } {
  const holdoutSize = Math.min(examples.length, Math.max(options.minHoldout, Math.ceil(examples.length * options.holdoutFraction)));
  return {
    training: examples.slice(0, examples.length - holdoutSize),
    holdout: examples.slice(examples.length - holdoutSize),
  };
}
