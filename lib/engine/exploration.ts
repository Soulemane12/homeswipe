import { DIMENSION_KEYS, getDimension } from "@/lib/features/dimensions";
import { cosine } from "@/lib/utils/math";
import { createRng, hashString } from "@/lib/utils/prng";
import { centeredFeatures } from "./catalog";
import type { HarnessPolicy } from "./policy-schema";
import { effectiveConfidence } from "./preference-state";
import type { CatalogStats, EngineProperty, PreferenceState, ScoredProperty } from "./types";

/** Minimum catalog spread for a dimension to be worth probing (otherwise every home looks the same). */
const MIN_SPREAD = 0.15;

export interface ExplorationTarget {
  dimension: string;
  confidence: number;
  priority: number;
}

/**
 * Active preference discovery: dimensions we know least about, weighted by how much the
 * catalog varies on them. Explicitly corrected dimensions are never re-probed.
 */
export function selectExplorationTargets(
  state: PreferenceState,
  stats: CatalogStats,
  policy: HarnessPolicy,
  maxTargets = 2,
): ExplorationTarget[] {
  const targets: ExplorationTarget[] = [];
  DIMENSION_KEYS.forEach((key, i) => {
    const dim = state.dimensions[key];
    if (!dim || dim.explicit?.source === "correction") return;
    const confidence = effectiveConfidence(dim);
    const spread = stats.featureStd[i] ?? 0;
    if (confidence >= policy.explorationPolicy.minConfidenceTarget || spread < MIN_SPREAD) return;
    const categoryPrior = getDimension(key)?.category === "location" ? 0.8 : 1;
    targets.push({ dimension: key, confidence, priority: (1 - confidence) * spread * categoryPrior });
  });
  return targets.sort((a, b) => b.priority - a.priority).slice(0, maxTargets);
}

export interface ExplorationPick {
  scored: ScoredProperty;
  targetDimension?: string;
}

/**
 * Chooses exploration items from the remaining (non-top) candidates.
 * - uncertainty: otherwise-relevant homes that are extreme on an uncertain dimension,
 *   alternating high/low values so the response reveals direction, not just intensity.
 * - diversity: the candidate least similar to what's already selected.
 * - epsilon: a reproducible random candidate.
 */
export function pickExploration(input: {
  strategy: HarnessPolicy["explorationPolicy"]["strategy"];
  slots: number;
  remaining: ScoredProperty[];
  selected: ScoredProperty[];
  properties: Map<string, EngineProperty>;
  stats: CatalogStats;
  targets: ExplorationTarget[];
  seed: string;
}): ExplorationPick[] {
  const { strategy, slots, stats, properties, targets } = input;
  if (slots <= 0 || strategy === "none" || input.remaining.length === 0) return [];
  const pool = [...input.remaining];
  const picks: ExplorationPick[] = [];
  const rng = createRng(hashString(input.seed));

  for (let s = 0; s < slots && pool.length > 0; s++) {
    let bestIdx = 0;
    let target: string | undefined;
    if (strategy === "uncertainty" && targets.length > 0) {
      target = targets[s % targets.length].dimension;
      const idx = DIMENSION_KEYS.indexOf(target);
      const wantHigh = s % 2 === 0;
      let best = -Infinity;
      pool.forEach((c, i) => {
        const p = properties.get(c.propertyId);
        if (!p) return;
        const v = centeredFeatures(p, stats)[idx];
        const info = wantHigh ? v : -v;
        const value = 0.6 * info + 0.4 * c.breakdown.fit;
        if (value > best) {
          best = value;
          bestIdx = i;
        }
      });
    } else if (strategy === "diversity") {
      const selectedVectors = [...input.selected, ...picks.map((p) => p.scored)]
        .map((c) => properties.get(c.propertyId))
        .filter((p): p is EngineProperty => p !== undefined)
        .map((p) => centeredFeatures(p, stats));
      let best = -Infinity;
      pool.forEach((c, i) => {
        const p = properties.get(c.propertyId);
        if (!p) return;
        const v = centeredFeatures(p, stats);
        const maxSim = selectedVectors.reduce((m, sv) => Math.max(m, cosine(sv, v)), -1);
        const value = 1 - maxSim + 0.3 * c.breakdown.fit;
        if (value > best) {
          best = value;
          bestIdx = i;
        }
      });
    } else {
      bestIdx = Math.floor(rng() * pool.length);
    }
    const [chosen] = pool.splice(bestIdx, 1);
    picks.push({ scored: chosen, targetDimension: target });
  }
  return picks;
}

/** Number of exploration slots for a page of `limit` items (fractional rates resolve deterministically). */
export function explorationSlots(rate: number, limit: number, seed: string): number {
  const expected = rate * limit;
  const base = Math.floor(expected);
  const remainder = expected - base;
  const rng = createRng(hashString(`slots:${seed}`));
  return base + (rng() < remainder ? 1 : 0);
}
