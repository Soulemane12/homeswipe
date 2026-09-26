import "server-only";
import { listVectorIndexStatus } from "./indexes";

const TTL_MS = 60_000;
let cache: { at: number; queryable: Set<string> } | null = null;

/**
 * Whether an Atlas Vector Search index is queryable right now (cached for 60s). Any error —
 * e.g. a local MongoDB without Atlas Search — counts as "not queryable" so callers fall back.
 */
export async function isVectorIndexQueryable(name: string): Promise<boolean> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    try {
      const statuses = await listVectorIndexStatus();
      cache = { at: Date.now(), queryable: new Set(statuses.filter((s) => s.queryable).map((s) => s.name)) };
    } catch {
      cache = { at: Date.now(), queryable: new Set() };
    }
  }
  return cache.queryable.has(name);
}

export function invalidateVectorReadiness(): void {
  cache = null;
}
