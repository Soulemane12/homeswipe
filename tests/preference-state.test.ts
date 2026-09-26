import { describe, expect, it } from "vitest";
import { interactionSignal, RAPID_DISLIKE_MULTIPLIER } from "@/lib/config/signals";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { INITIAL_POLICY } from "@/lib/engine/policy-schema";
import { buildPreferenceState, effectiveConfidence, effectiveStrength } from "@/lib/engine/preference-state";
import type { EngineInteraction } from "@/lib/engine/types";
import { interaction, makeProperty } from "./helpers/fixtures";

function catalog() {
  const bright = Array.from({ length: 8 }, (_, i) => makeProperty({ id: `bright${i}`, f: { natural_light: 0.9, dark_interior: 0.1, carpet: i % 2 ? 0.8 : 0.1, open_kitchen: i % 3 ? 0.8 : 0.2 } }));
  const dark = Array.from({ length: 8 }, (_, i) => makeProperty({ id: `dark${i}`, f: { natural_light: 0.1, dark_interior: 0.9, carpet: i % 2 ? 0.8 : 0.1, open_kitchen: i % 3 ? 0.8 : 0.2 } }));
  const all = [...bright, ...dark];
  return { all, properties: new Map(all.map((p) => [p.id, p])), stats: computeCatalogStats(all) };
}

function state(interactions: EngineInteraction[], memoryPolicy = INITIAL_POLICY.memoryPolicy) {
  const { properties, stats } = catalog();
  return buildPreferenceState({ interactions, properties, stats, memoryPolicy, explicit: { positive: [], negative: [] }, space: "local" });
}

describe("signal strengths", () => {
  it("orders explicit signals above passive ones and boosts rapid dislikes", () => {
    expect(interactionSignal({ type: "super_like" })).toBeGreaterThan(interactionSignal({ type: "save" }));
    expect(interactionSignal({ type: "save" })).toBeGreaterThan(interactionSignal({ type: "like" }));
    expect(interactionSignal({ type: "like" })).toBeGreaterThan(interactionSignal({ type: "detail_open" }));
    expect(interactionSignal({ type: "dislike", dwellMs: 800 })).toBeCloseTo(-1 * RAPID_DISLIKE_MULTIPLIER);
    expect(interactionSignal({ type: "dislike", dwellMs: 5000 })).toBe(-1);
    expect(interactionSignal({ type: "save", collectionKind: "dream" })).toBeGreaterThan(interactionSignal({ type: "save", collectionKind: "favorites" }));
  });
});

describe("preference state", () => {
  const history = [
    ...Array.from({ length: 8 }, (_, i) => interaction(`l${i}`, `bright${i}`, "like", i)),
    ...Array.from({ length: 8 }, (_, i) => interaction(`d${i}`, `dark${i}`, "dislike", 10 + i, { dwellMs: 4000 })),
  ];

  it("learns a positive dimension from likes and a negative one from dislikes", () => {
    const s = state(history);
    expect(s.dimensions.natural_light.longTerm).toBeGreaterThan(0.2);
    expect(s.dimensions.dark_interior.longTerm).toBeLessThan(-0.2);
    expect(s.dimensions.natural_light.confidence).toBeGreaterThan(0.5);
    // Carpet was split evenly between likes and dislikes → no strong opinion.
    expect(Math.abs(s.dimensions.carpet.longTerm)).toBeLessThan(Math.abs(s.dimensions.natural_light.longTerm));
  });

  it("tracks recent behavior separately from long-term memory", () => {
    const shifted = [
      ...Array.from({ length: 8 }, (_, i) => interaction(`d${i}`, `dark${i}`, "like", i)),
      ...Array.from({ length: 8 }, (_, i) => interaction(`b${i}`, `bright${i}`, "like", 20 + i)),
      ...Array.from({ length: 4 }, (_, i) => interaction(`x${i}`, `dark${i}`, "dislike", 40 + i)),
    ];
    const s = state(shifted, { ...INITIAL_POLICY.memoryPolicy, recentInteractionWindow: 8 });
    expect(s.dimensions.natural_light.recent).toBeGreaterThan(s.dimensions.natural_light.longTerm);
  });

  it("lets an explicit correction override inferred evidence with high confidence", () => {
    const corrected = [...history, { id: "c1", type: "preference_correction" as const, createdAt: new Date(Date.UTC(2026, 8, 2)), simulated: false, corrections: [{ dimension: "natural_light", stance: "not_important" as const, direction: "positive" as const }] }];
    const s = state(corrected);
    expect(effectiveStrength(s.dimensions.natural_light, INITIAL_POLICY.memoryPolicy)).toBe(0);
    expect(effectiveConfidence(s.dimensions.natural_light)).toBeGreaterThanOrEqual(0.95);
  });

  it("removes blamed evidence when the user says a dislike was not because of an attribute", () => {
    const dislikes = Array.from({ length: 6 }, (_, i) => interaction(`k${i}`, `dark${i}`, "dislike", i));
    const blamed = state(dislikes).dimensions.open_kitchen.evidenceCount;
    const corrections = dislikes.map((d, i) => ({ id: `cc${i}`, type: "preference_correction" as const, createdAt: new Date(Date.UTC(2026, 8, 3, 0, i)), simulated: false, targetInteractionId: d.id, attribution: { open_kitchen: 0 } }));
    const s = state([...dislikes, ...corrections]);
    expect(s.dimensions.open_kitchen.evidenceCount).toBeLessThan(blamed);
    expect(Math.abs(s.dimensions.open_kitchen.longTerm)).toBeLessThan(0.05);
  });

  it("scales negative preferences by the policy's negative-memory weight", () => {
    const s = state(history);
    const soft = effectiveStrength(s.dimensions.dark_interior, { ...INITIAL_POLICY.memoryPolicy, negativeMemoryWeight: 0.5 });
    const hard = effectiveStrength(s.dimensions.dark_interior, { ...INITIAL_POLICY.memoryPolicy, negativeMemoryWeight: 2 });
    expect(hard).toBeLessThan(soft);
  });
});
