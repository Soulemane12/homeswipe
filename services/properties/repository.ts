import "server-only";
import { toEngineProperty } from "@/lib/engine/adapters";
import { chooseVectorSpace, computeCatalogStats } from "@/lib/engine/catalog";
import type { CatalogStats, EngineProperty, VectorSpace } from "@/lib/engine/types";
import { activeEmbeddingModel } from "@/lib/embeddings/provider";
import { db } from "@/lib/mongodb/collections";
import { fromPropertyDoc, type Property } from "@/models/property";

export async function getPropertyById(id: string): Promise<Property | null> {
  const c = await db();
  const doc = await c.properties.findOne({ _id: id }, { projection: { "ai.embedding": 0 } });
  return doc ? fromPropertyDoc(doc) : null;
}

export async function getPropertiesByIds(ids: string[]): Promise<Property[]> {
  if (ids.length === 0) return [];
  const c = await db();
  const docs = await c.properties.find({ _id: { $in: ids } }, { projection: { "ai.embedding": 0 } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, fromPropertyDoc(d)]));
  return ids.map((id) => byId.get(id)).filter((p): p is Property => p !== undefined);
}

export interface Catalog {
  properties: Property[];
  engine: EngineProperty[];
  byId: Map<string, EngineProperty>;
  propertyById: Map<string, Property>;
  stats: CatalogStats;
  space: VectorSpace;
  loadedAt: number;
}

const CATALOG_TTL_MS = 60_000;
let catalogCache: Catalog | null = null;

/**
 * The active catalog with engine representations and centering stats. The dataset is small
 * (≈150 listings), so ranking math runs in-process on this cached snapshot, while retrieval
 * and hard-constraint filtering run in MongoDB.
 */
export async function loadCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) return catalogCache;
  const c = await db();
  const docs = await c.properties.find({ status: "active" }).toArray();
  const properties = docs.map(fromPropertyDoc);
  const engine = properties.map(toEngineProperty);
  const space = chooseVectorSpace(engine, activeEmbeddingModel() ?? undefined);
  catalogCache = {
    properties: properties.map((p) => ({ ...p, ai: { ...p.ai, embedding: undefined } })),
    engine,
    byId: new Map(engine.map((p) => [p.id, p])),
    propertyById: new Map(properties.map((p) => [p.id, { ...p, ai: { ...p.ai, embedding: undefined } }])),
    stats: computeCatalogStats(engine, space),
    space,
    loadedAt: Date.now(),
  };
  return catalogCache;
}

export function invalidateCatalog(): void {
  catalogCache = null;
}

export async function availableListingTypes(): Promise<string[]> {
  const c = await db();
  return (await c.properties.distinct("listingType", { status: "active" })) as string[];
}
