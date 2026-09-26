import type { HarnessPolicy } from "./policy-schema";

export interface PolicyDiffEntry {
  path: string;
  from: number | boolean | string | null;
  to: number | boolean | string | null;
}

type Leaf = number | boolean | string | null;

function flatten(value: unknown, prefix: string, out: Map<string, Leaf>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") out.set(prefix, value);
}

/** Leaf-level differences between two policies, sorted by path. Tiny float noise is ignored. */
export function diffPolicies(from: HarnessPolicy, to: HarnessPolicy): PolicyDiffEntry[] {
  const a = new Map<string, Leaf>();
  const b = new Map<string, Leaf>();
  flatten(from, "", a);
  flatten(to, "", b);
  const paths = new Set([...a.keys(), ...b.keys()]);
  const diff: PolicyDiffEntry[] = [];
  for (const path of paths) {
    const x = a.get(path) ?? null;
    const y = b.get(path) ?? null;
    if (typeof x === "number" && typeof y === "number" && Math.abs(x - y) < 0.0005) continue;
    if (x !== y) diff.push({ path, from: x, to: y });
  }
  return diff.sort((p, q) => p.path.localeCompare(q.path));
}
