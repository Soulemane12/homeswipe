import "server-only";
import type { Collections } from "./collections";
import { db } from "./collections";
import { VECTOR_INDEXES } from "./vector-indexes";

/** Regular (B-tree / 2dsphere) indexes. Idempotent. */
export async function ensureIndexes(collections?: Collections): Promise<void> {
  const c = collections ?? (await db());
  await Promise.all([
    c.properties.createIndexes([
      { key: { status: 1, listingType: 1 } },
      { key: { "financial.price": 1 } },
      { key: { "facts.bedrooms": 1 } },
      { key: { "address.borough": 1 } },
      { key: { "address.neighborhood": 1 } },
      { key: { "address.location": "2dsphere" } },
      { key: { listedAt: -1 } },
    ]),
    c.interactions.createIndexes([
      { key: { userId: 1, createdAt: 1 } },
      { key: { userId: 1, propertyId: 1 } },
      { key: { userId: 1, simulated: 1, createdAt: 1 } },
      // A reaction to a given impression is recorded once (double-taps / retries are idempotent).
      {
        key: { impressionId: 1, type: 1 },
        unique: true,
        name: "one_reaction_per_impression",
        partialFilterExpression: { impressionId: { $exists: true }, type: { $in: ["like", "dislike", "super_like"] } },
      },
    ]),
    c.propertyImpressions.createIndexes([
      { key: { userId: 1, shownAt: -1 } },
      { key: { userId: 1, policyVersion: 1 } },
      { key: { userId: 1, propertyId: 1, resolved: 1, shownAt: -1 } },
    ]),
    c.recommendationPredictions.createIndexes([
      { key: { userId: 1, resolvedAt: 1 } },
      { key: { userId: 1, policyVersion: 1, simulated: 1 } },
      { key: { impressionId: 1 }, unique: true },
    ]),
    c.recommendationSessions.createIndexes([{ key: { userId: 1, lastActiveAt: -1 } }]),
    c.preferenceMemories.createIndexes([
      { key: { userId: 1, type: 1 } },
      { key: { userId: 1, type: 1, key: 1 }, unique: true },
    ]),
    c.preferenceDimensions.createIndexes([{ key: { userId: 1, dimension: 1 }, unique: true }]),
    c.harnessPolicies.createIndexes([
      { key: { userId: 1, version: 1 }, unique: true },
      { key: { userId: 1, status: 1 } },
      { key: { userId: 1 }, unique: true, partialFilterExpression: { status: "active" }, name: "one_active_policy_per_user" },
    ]),
    c.harnessExperiments.createIndexes([
      { key: { userId: 1, kind: 1, createdAt: -1 } },
      { key: { impressionId: 1 }, sparse: true },
    ]),
    c.evaluationRuns.createIndexes([{ key: { userId: 1, createdAt: -1 } }]),
    c.savedProperties.createIndexes([{ key: { userId: 1, propertyId: 1 }, unique: true }]),
    c.collections.createIndexes([{ key: { userId: 1, kind: 1 } }]),
    c.savedSearches.createIndexes([{ key: { userId: 1, createdAt: -1 } }]),
    c.conversations.createIndexes([{ key: { userId: 1, createdAt: -1 } }]),
  ]);
}

export interface SearchIndexStatus {
  name: string;
  status: string;
  queryable: boolean;
}

export async function listVectorIndexStatus(collections?: Collections): Promise<SearchIndexStatus[]> {
  const c = collections ?? (await db());
  const indexes = (await c.properties.listSearchIndexes().toArray()) as { name: string; status?: string; queryable?: boolean }[];
  return indexes.map((i) => ({ name: i.name, status: i.status ?? "UNKNOWN", queryable: Boolean(i.queryable) }));
}

/**
 * Creates (or updates) the Atlas Vector Search indexes. Index builds are asynchronous on
 * Atlas, so callers should follow up with `waitForVectorIndexes`.
 */
export async function ensureVectorIndexes(collections?: Collections): Promise<{ created: string[]; updated: string[] }> {
  const c = collections ?? (await db());
  const existing = (await c.properties.listSearchIndexes().toArray()) as { name: string; latestDefinition?: unknown }[];
  const created: string[] = [];
  const updated: string[] = [];
  for (const index of VECTOR_INDEXES) {
    const current = existing.find((e) => e.name === index.name);
    if (!current) {
      await c.properties.createSearchIndex({ name: index.name, type: index.type, definition: index.definition });
      created.push(index.name);
    } else if (JSON.stringify(normalizeDefinition(current.latestDefinition)) !== JSON.stringify(normalizeDefinition(index.definition))) {
      await c.properties.updateSearchIndex(index.name, index.definition);
      updated.push(index.name);
    }
  }
  return { created, updated };
}

function normalizeDefinition(definition: unknown): unknown {
  const fields = (definition as { fields?: Record<string, unknown>[] } | undefined)?.fields ?? [];
  return fields
    .map((f) => ({ type: f.type, path: f.path, numDimensions: f.numDimensions, similarity: f.similarity }))
    .sort((a, b) => `${a.type}${a.path}`.localeCompare(`${b.type}${b.path}`));
}

/** Polls listSearchIndexes() until every vector index reports queryable, or the timeout passes. */
export async function waitForVectorIndexes(options: { timeoutMs: number; intervalMs?: number; onPoll?: (s: SearchIndexStatus[]) => void }): Promise<{ ready: boolean; statuses: SearchIndexStatus[] }> {
  const deadline = Date.now() + options.timeoutMs;
  const names = VECTOR_INDEXES.map((i) => i.name);
  let statuses: SearchIndexStatus[] = [];
  while (Date.now() < deadline) {
    statuses = (await listVectorIndexStatus()).filter((s) => names.includes(s.name));
    options.onPoll?.(statuses);
    if (names.every((n) => statuses.find((s) => s.name === n)?.queryable)) return { ready: true, statuses };
    await new Promise((r) => setTimeout(r, options.intervalMs ?? 5000));
  }
  return { ready: false, statuses };
}
