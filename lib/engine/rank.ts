import { satisfiesHardConstraints } from "./constraints";
import { explorationSlots, pickExploration, selectExplorationTargets, type ExplorationTarget } from "./exploration";
import { predictLike, type Prediction } from "./prediction";
import { createScorer, type ScoringContext } from "./scoring";
import type { EngineProperty, ScoredProperty } from "./types";

export interface RankedItem extends Prediction {
  scored: ScoredProperty;
  rank: number;
  exploration: boolean;
  targetDimension?: string;
}

export interface RankResult {
  items: RankedItem[];
  targets: ExplorationTarget[];
  /** Candidates dropped by the post-rank hard-constraint assertion (should always be 0). */
  constraintViolations: number;
}

/**
 * Scores candidates under the policy, fills most slots by ranking score and reserves
 * `explorationPolicy.rate` of them for active preference discovery. Exploration items are
 * interleaved (not appended) so they are actually seen.
 */
export function rankCandidates(input: {
  candidates: EngineProperty[];
  ctx: Omit<ScoringContext, "explorationTargets">;
  limit: number;
  seed: string;
}): RankResult {
  const { ctx, limit, seed } = input;
  const eligible = input.candidates.filter((p) => satisfiesHardConstraints(p, ctx.constraints));
  const constraintViolations = input.candidates.length - eligible.length;

  const targets =
    ctx.policy.explorationPolicy.strategy === "uncertainty"
      ? selectExplorationTargets(ctx.state, ctx.stats, ctx.policy)
      : [];
  const scorer = createScorer({ ...ctx, explorationTargets: targets.map((t) => t.dimension) });
  const scored = eligible.map((p) => scorer.score(p)).sort((a, b) => b.breakdown.total - a.breakdown.total);

  const slots = Math.min(explorationSlots(ctx.policy.explorationPolicy.rate, limit, seed), Math.max(0, scored.length - 1));
  const mainCount = Math.min(limit - slots, scored.length);
  const main = scored.slice(0, mainCount);
  const picks = pickExploration({
    strategy: ctx.policy.explorationPolicy.strategy,
    slots,
    remaining: scored.slice(mainCount),
    selected: main,
    properties: ctx.properties,
    stats: ctx.stats,
    targets,
    seed,
  });

  const ordered: { scored: ScoredProperty; exploration: boolean; targetDimension?: string }[] = main.map((s) => ({
    scored: s,
    exploration: false,
  }));
  picks.forEach((pick, i) => {
    const position = Math.min(ordered.length, 2 + i * 4);
    ordered.splice(position, 0, { scored: pick.scored, exploration: true, targetDimension: pick.targetDimension });
  });

  const items = ordered.slice(0, limit).map((o, rank) => ({
    ...o,
    rank,
    ...predictLike(o.scored.breakdown.fit, ctx.policy.prediction),
  }));
  return { items, targets, constraintViolations };
}
