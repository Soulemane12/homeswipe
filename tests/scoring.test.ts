import { describe, expect, it } from "vitest";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { INITIAL_POLICY, normalizeWeights } from "@/lib/engine/policy-schema";
import { displayMatch, predictLike } from "@/lib/engine/prediction";
import { buildPreferenceState } from "@/lib/engine/preference-state";
import { createScorer } from "@/lib/engine/scoring";
import { RANKING_COMPONENTS } from "@/lib/engine/types";
import { ANY, interaction, makeProperty } from "./helpers/fixtures";

describe("ranking and prediction", () => {
  const liked = Array.from({ length: 6 }, (_, i) => makeProperty({ id: `l${i}`, f: { natural_light: 0.9, hardwood: 0.85, carpet: 0.05 } }));
  const disliked = Array.from({ length: 6 }, (_, i) => makeProperty({ id: `d${i}`, f: { natural_light: 0.1, hardwood: 0.1, carpet: 0.9 } }));
  const candidateGood = makeProperty({ id: "good", f: { natural_light: 0.95, hardwood: 0.9, carpet: 0.02 } });
  const candidateBad = makeProperty({ id: "bad", f: { natural_light: 0.05, hardwood: 0.05, carpet: 0.95 } });
  const all = [...liked, ...disliked, candidateGood, candidateBad];
  const properties = new Map(all.map((p) => [p.id, p]));
  const stats = computeCatalogStats(all);
  const history = [...liked.map((p, i) => interaction(`il${i}`, p.id, "like", i)), ...disliked.map((p, i) => interaction(`id${i}`, p.id, "dislike", 20 + i, { dwellMs: 3000 }))];
  const policy = { ...INITIAL_POLICY, rankingWeights: normalizeWeights({ semantic: 0.25, explicit: 0.05, inferred: 0.2, visual: 0.3, behavior: 0.15, metadata: 0.05, freshness: 0, exploration: 0 }) };
  const state = buildPreferenceState({ interactions: history, properties, stats, memoryPolicy: policy.memoryPolicy, explicit: { positive: [], negative: [] }, space: "local" });
  const scorer = createScorer({ state, policy, stats, constraints: ANY, properties, now: new Date("2026-09-02") });

  it("returns an interpretable breakdown with every component in [0, 1]", () => {
    const b = scorer.score(candidateGood).breakdown;
    for (const c of RANKING_COMPONENTS) {
      expect(b[c]).toBeGreaterThanOrEqual(0);
      expect(b[c]).toBeLessThanOrEqual(1);
    }
    expect(b.fit).toBeGreaterThan(0);
    expect(b.total).toBeLessThanOrEqual(1);
  });

  it("scores a home matching learned taste above one that contradicts it", () => {
    const good = scorer.score(candidateGood);
    const bad = scorer.score(candidateBad);
    expect(good.breakdown.fit).toBeGreaterThan(bad.breakdown.fit);
    expect(good.breakdown.visual).toBeGreaterThan(0.5);
    expect(bad.breakdown.visual).toBeLessThan(0.5);
    expect(good.reasons.map((r) => r.dimension)).toContain("natural_light");
    expect(bad.tradeoffs.map((r) => r.dimension)).toEqual(expect.arrayContaining(["carpet"]));
  });

  it("derives the like score from fit with the policy threshold (not a probability)", () => {
    const at = predictLike(0.5, { threshold: 0.5, sharpness: 10 });
    expect(at.predictedLikeScore).toBeCloseTo(0.5);
    expect(at.predictedLabel).toBe("LIKE");
    expect(predictLike(0.45, { threshold: 0.5, sharpness: 10 }).predictedLabel).toBe("DISLIKE");
    expect(predictLike(0.7, { threshold: 0.5, sharpness: 10 }).predictedLikeScore).toBeGreaterThan(0.85);
    const good = predictLike(scorer.score(candidateGood).breakdown.fit, policy.prediction);
    const bad = predictLike(scorer.score(candidateBad).breakdown.fit, policy.prediction);
    expect(good.predictedLikeScore).toBeGreaterThan(bad.predictedLikeScore);
  });

  it("maps fit to a deterministic, monotonic, clamped match percentage", () => {
    expect(displayMatch(0.5)).toBe(65);
    expect(displayMatch(0.75)).toBe(86);
    expect(displayMatch(0.6)).toBeGreaterThan(displayMatch(0.55));
    expect(displayMatch(1)).toBe(99);
    expect(displayMatch(0)).toBe(35);
    expect(displayMatch(0.61)).toBe(displayMatch(0.61));
  });
});
