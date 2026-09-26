import { describe, expect, it } from "vitest";
import { HARNESS_CONFIG, LEARNING_CONFIG } from "@/lib/config/harness";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { computeMetrics } from "@/lib/engine/metrics";
import { INITIAL_POLICY, safeParsePolicy } from "@/lib/engine/policy-schema";
import { replayPolicy, type ReplayDataset } from "@/lib/engine/replay";
import { HIDDEN_PROFILES } from "@/lib/simulation/hidden-profiles";
import { ANY } from "./helpers/fixtures";
import { loadSeedEngineProperties, runOfflineSimulation, type OfflineRun } from "./helpers/offline-sim";

function sameDataComparison(run: OfflineRun, profileIndex: number, window = 40) {
  const props = loadSeedEngineProperties();
  const dataset: ReplayDataset = {
    examples: run.examples,
    interactions: run.examples.map((e, i) => ({ id: `i-${i}`, propertyId: e.propertyId, type: e.outcomeType as never, createdAt: e.resolvedAt, dwellMs: e.dwellMs, simulated: true })),
    properties: new Map(props.map((p) => [p.id, p])),
    stats: computeCatalogStats(props),
    explicit: HIDDEN_PROFILES[profileIndex].onboarding,
    constraints: ANY,
    space: "local",
    batchEvery: LEARNING_CONFIG.preferenceUpdateEvery,
    fitCache: new Map(),
  };
  const last = run.examples.slice(-window);
  return {
    v1: computeMetrics(replayPolicy(dataset, INITIAL_POLICY, { examples: last })),
    final: computeMetrics(replayPolicy(dataset, run.finalPolicy, { examples: last })),
  };
}

describe("recursive harness (offline, end to end)", () => {
  const run = runOfflineSimulation({ profile: HIDDEN_PROFILES[0], steps: 100, constraints: ANY, seed: 13 });

  it("waits for enough evidence before evolving", () => {
    const first = run.evolutions[0];
    expect(first).toBeDefined();
    expect(first.totalResolved).toBeGreaterThanOrEqual(HARNESS_CONFIG.minResolvedForEvolution);
    expect(first.holdoutRange!.n).toBeGreaterThanOrEqual(HARNESS_CONFIG.minHoldoutExamples);
  });

  it("promotes only candidates that pass every holdout check", () => {
    for (const ev of run.evolutions) {
      if (ev.status !== "promoted") continue;
      expect(ev.candidateHoldoutMetrics!.accuracy).toBeGreaterThanOrEqual(ev.currentHoldoutMetrics!.accuracy + HARNESS_CONFIG.minAccuracyDelta - 1e-9);
      expect(ev.paired!.candidateOnlyCorrect).toBeGreaterThan(ev.paired!.currentOnlyCorrect);
      expect(ev.decision!.checks.every((c) => c.passed)).toBe(true);
      expect(safeParsePolicy(ev.selected!.policy).ok).toBe(true);
      expect(ev.selected!.changes.every((c) => typeof c.evidence === "string" && c.evidence.length > 0 && c.expectedEffect.length > 0)).toBe(true);
    }
    expect(run.evolutions.some((e) => e.status === "promoted")).toBe(true);
    expect(run.finalVersion).toBeGreaterThan(1);
  });

  it("records rejected candidates with the reasons they failed", () => {
    for (const ev of run.evolutions.filter((e) => e.status === "rejected")) {
      expect(ev.reason.startsWith("Rejected")).toBe(true);
      expect(ev.decision!.checks.some((c) => !c.passed)).toBe(true);
    }
  });

  it("the evolved policy predicts the latest behavior better than v1 on the same data", () => {
    const { v1, final } = sameDataComparison(run, 0);
    expect(final.accuracy).toBeGreaterThan(v1.accuracy);
    expect(final.auc).toBeGreaterThan(v1.auc);
  });

  it("is deterministic", () => {
    const again = runOfflineSimulation({ profile: HIDDEN_PROFILES[0], steps: 100, constraints: ANY, seed: 13 });
    expect(again.examples.map((e) => `${e.propertyId}:${e.predicted}:${e.actual}`)).toEqual(run.examples.map((e) => `${e.propertyId}:${e.predicted}:${e.actual}`));
    expect(again.finalPolicy).toEqual(run.finalPolicy);
  });

  it("improves over v1 for other hidden users too", () => {
    for (const [i, profile] of HIDDEN_PROFILES.entries()) {
      if (i === 0) continue;
      const r = runOfflineSimulation({ profile, steps: 100, constraints: ANY, seed: 13 });
      const { v1, final } = sameDataComparison(r, i);
      expect(final.auc, profile.key).toBeGreaterThanOrEqual(v1.auc);
    }
  });
});
