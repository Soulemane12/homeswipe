import { z } from "zod";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { CANDIDATE_GENERATORS, EXPLORATION_STRATEGIES, safeParsePolicy, type HarnessPolicy } from "./policy-schema";
import { PREDICTIVE_COMPONENTS, RANKING_COMPONENTS } from "./types";

/**
 * A policy change is a (path, op, value) triple restricted to an allow-list of paths. This is
 * the only vocabulary the harness — including any LLM proposer — can use to modify behavior.
 */
const STATIC_PATHS: readonly string[] = [
  ...RANKING_COMPONENTS.map((c) => `rankingWeights.${c}`),
  "memoryPolicy.recentInteractionWindow",
  "memoryPolicy.maxPositiveMemories",
  "memoryPolicy.maxNegativeMemories",
  "memoryPolicy.recentMemoryWeight",
  "memoryPolicy.longTermMemoryWeight",
  "memoryPolicy.negativeMemoryWeight",
  "explorationPolicy.rate",
  "explorationPolicy.strategy",
  "explorationPolicy.minConfidenceTarget",
  "contextPolicy.includeExplicitPreferences",
  "contextPolicy.includeRecentMemories",
  "contextPolicy.includeNegativeMemories",
  "contextPolicy.includeUncertaintyMemories",
  ...CANDIDATE_GENERATORS.flatMap((g) => [`candidateGenerators.${g}.enabled`, `candidateGenerators.${g}.limit`]),
  "prediction.threshold",
  "prediction.sharpness",
];

const FEATURE_IMPORTANCE_PATH = /^featureImportance\.([a-z][a-z0-9_]{1,47})$/;

export function isAllowedPath(path: string): boolean {
  if (STATIC_PATHS.includes(path)) return true;
  const m = FEATURE_IMPORTANCE_PATH.exec(path);
  return m !== null && isAllowedDimension(m[1]);
}

/** Paths whose effect on like prediction can be measured by offline replay. */
export function isBacktestablePath(path: string): boolean {
  if (path.startsWith("featureImportance.")) return true;
  if (path.startsWith("prediction.")) return true;
  if (path.startsWith("rankingWeights.")) {
    return (PREDICTIVE_COMPONENTS as readonly string[]).includes(path.split(".")[1]);
  }
  return [
    "memoryPolicy.recentInteractionWindow",
    "memoryPolicy.recentMemoryWeight",
    "memoryPolicy.longTermMemoryWeight",
    "memoryPolicy.negativeMemoryWeight",
  ].includes(path);
}

export const PolicyChangeSchema = z.object({
  path: z.string().refine(isAllowedPath, "path is not an allowed policy parameter"),
  op: z.enum(["set", "scale", "add"]),
  value: z.union([z.number(), z.boolean(), z.enum(EXPLORATION_STRATEGIES)]),
  evidence: z.string().min(1).max(600),
  expectedEffect: z.string().min(1).max(400),
});
export type PolicyChange = z.infer<typeof PolicyChangeSchema>;

type PolicyRecord = Record<string, unknown>;

export function getAtPath(policy: HarnessPolicy, path: string): unknown {
  let node: unknown = policy;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as PolicyRecord)[part];
  }
  return node;
}

function setAtPath(target: PolicyRecord, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]];
    if (next === null || typeof next !== "object") node[parts[i]] = {};
    node = node[parts[i]] as PolicyRecord;
  }
  node[parts[parts.length - 1]] = value;
}

function resolveValue(current: unknown, change: PolicyChange, path: string): unknown {
  if (change.op === "set") return change.value;
  if (typeof change.value !== "number") throw new Error(`op "${change.op}" requires a numeric value`);
  const base = typeof current === "number" ? current : path.startsWith("featureImportance.") ? 1 : 0;
  const next = change.op === "scale" ? base * change.value : base + change.value;
  return path.endsWith("recentInteractionWindow") || path.endsWith("Memories") || path.endsWith(".limit")
    ? Math.round(next)
    : Math.round(next * 1000) / 1000;
}

export type ApplyResult = { ok: true; policy: HarnessPolicy } | { ok: false; errors: string[] };

/** Applies changes to a copy of the policy, then re-validates the whole policy. */
export function applyChanges(policy: HarnessPolicy, changes: PolicyChange[]): ApplyResult {
  const draft = structuredClone(policy) as unknown as PolicyRecord;
  const errors: string[] = [];
  for (const change of changes) {
    const parsed = PolicyChangeSchema.safeParse(change);
    if (!parsed.success) {
      errors.push(`${change.path}: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
      continue;
    }
    try {
      const current = getAtPath(draft as unknown as HarnessPolicy, change.path);
      setAtPath(draft, change.path, resolveValue(current, change, change.path));
    } catch (error) {
      errors.push(`${change.path}: ${(error as Error).message}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return safeParsePolicy(draft);
}

/** Clamps a numeric value into the schema bounds for its path (used by proposers before validation). */
export const PATH_BOUNDS: Record<string, [number, number]> = {
  "memoryPolicy.recentInteractionWindow": [5, 200],
  "memoryPolicy.recentMemoryWeight": [0, 3],
  "memoryPolicy.longTermMemoryWeight": [0, 3],
  "memoryPolicy.negativeMemoryWeight": [0.3, 3],
  "explorationPolicy.rate": [0, 0.35],
  "explorationPolicy.minConfidenceTarget": [0.1, 0.9],
  "prediction.threshold": [0.2, 0.8],
  "prediction.sharpness": [2, 30],
};

export function boundsFor(path: string): [number, number] {
  if (path.startsWith("rankingWeights.")) return [0, 1];
  if (path.startsWith("featureImportance.")) return [0.25, 3];
  return PATH_BOUNDS[path] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
}
