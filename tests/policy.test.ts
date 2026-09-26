import { describe, expect, it } from "vitest";
import { applyChanges, isAllowedPath, isBacktestablePath } from "@/lib/engine/policy-patch";
import { diffPolicies } from "@/lib/engine/policy-diff";
import { INITIAL_POLICY, parsePolicy, safeParsePolicy } from "@/lib/engine/policy-schema";

const change = (path: string, op: "set" | "scale" | "add", value: number | boolean | string) => ({ path, op, value: value as never, evidence: "test evidence", expectedEffect: "test effect" });

describe("policy schema", () => {
  it("accepts the seeded v1 policy and normalizes ranking weights to sum to 1", () => {
    const p = parsePolicy(INITIAL_POLICY);
    const sum = Object.values(p.rankingWeights).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it("rejects out-of-bounds values and blocked feature-importance keys", () => {
    expect(safeParsePolicy({ ...INITIAL_POLICY, explorationPolicy: { ...INITIAL_POLICY.explorationPolicy, rate: 0.9 } }).ok).toBe(false);
    expect(safeParsePolicy({ ...INITIAL_POLICY, memoryPolicy: { ...INITIAL_POLICY.memoryPolicy, recentInteractionWindow: 1 } }).ok).toBe(false);
    expect(safeParsePolicy({ ...INITIAL_POLICY, featureImportance: { family_friendly: 2 } }).ok).toBe(false);
    expect(safeParsePolicy({ ...INITIAL_POLICY, featureImportance: { natural_light: 2 } }).ok).toBe(true);
  });

  it("has no path through which hard constraints could be changed", () => {
    expect(isAllowedPath("constraints.maxPrice")).toBe(false);
    expect(isAllowedPath("maxPrice")).toBe(false);
    expect(isAllowedPath("rankingWeights.semantic")).toBe(true);
    expect(isAllowedPath("featureImportance.church_nearby")).toBe(false);
  });
});

describe("policy changes and diffs", () => {
  it("applies set/scale/add changes and re-validates", () => {
    const res = applyChanges(INITIAL_POLICY, [
      change("memoryPolicy.negativeMemoryWeight", "scale", 1.5),
      change("explorationPolicy.strategy", "set", "uncertainty"),
      change("featureImportance.natural_light", "add", 0.5),
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.policy.memoryPolicy.negativeMemoryWeight).toBeCloseTo(1.2);
    expect(res.policy.explorationPolicy.strategy).toBe("uncertainty");
    expect(res.policy.featureImportance.natural_light).toBeCloseTo(1.5);
  });

  it("rejects disallowed paths and invalid results instead of executing them", () => {
    expect(applyChanges(INITIAL_POLICY, [change("constraints.maxPrice", "set", 5_000_000)]).ok).toBe(false);
    expect(applyChanges(INITIAL_POLICY, [change("explorationPolicy.rate", "set", 5)]).ok).toBe(false);
  });

  it("separates backtestable prediction changes from retrieval changes", () => {
    expect(isBacktestablePath("rankingWeights.visual")).toBe(true);
    expect(isBacktestablePath("prediction.threshold")).toBe(true);
    expect(isBacktestablePath("rankingWeights.freshness")).toBe(false);
    expect(isBacktestablePath("candidateGenerators.similarLiked.enabled")).toBe(false);
  });

  it("diffs two policies at leaf level", () => {
    const res = applyChanges(INITIAL_POLICY, [change("prediction.threshold", "set", 0.55), change("candidateGenerators.similarLiked.enabled", "set", true)]);
    if (!res.ok) throw new Error(res.errors.join());
    const diff = diffPolicies(INITIAL_POLICY, res.policy);
    expect(diff).toEqual([
      { path: "candidateGenerators.similarLiked.enabled", from: false, to: true },
      { path: "prediction.threshold", from: 0.5, to: 0.55 },
    ]);
  });
});
