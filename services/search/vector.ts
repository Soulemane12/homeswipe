import "server-only";
import { satisfiesHardConstraints, toVectorSearchFilter } from "@/lib/engine/constraints";
import type { EngineProperty } from "@/lib/engine/types";
import { cosine, norm } from "@/lib/utils/math";
import { db } from "@/lib/mongodb/collections";
import { EMBEDDING_INDEX_NAME, FEATURE_INDEX_NAME } from "@/lib/mongodb/vector-indexes";
import { isVectorIndexQueryable } from "@/lib/mongodb/vector-readiness";
import type { RetrievalMode } from "@/models/recommendation";
import type { HardConstraints } from "@/models/user";
import type { Catalog } from "@/services/properties/repository";

export interface VectorHit {
  id: string;
  score: number;
}

export interface VectorQuery {
  /** "embedding" = Voyage/OpenAI vectors (requires `model`); "feature" = local feature vectors. */
  space: "embedding" | "feature";
  vector: number[];
  model?: string;
  constraints: HardConstraints;
  limit: number;
  catalog: Catalog;
}

/**
 * Semantic retrieval with hard constraints as prefilters. Uses Atlas Vector Search when the
 * index is queryable; otherwise computes cosine similarity in-process over the constraint-
 * filtered catalog. The mode actually used is returned so it is never a silent fallback.
 */
export async function vectorSearch(query: VectorQuery): Promise<{ hits: VectorHit[]; mode: RetrievalMode }> {
  if (norm(query.vector) < 1e-9 || query.limit <= 0) return { hits: [], mode: "in_app_cosine" };
  const indexName = query.space === "embedding" ? EMBEDDING_INDEX_NAME : FEATURE_INDEX_NAME;
  const path = query.space === "embedding" ? "ai.embedding" : "ai.featureVector";

  if (await isVectorIndexQueryable(indexName)) {
    try {
      const c = await db();
      const extra = query.space === "embedding" && query.model ? { "ai.embeddingModel": { $eq: query.model } } : {};
      const hits = await c.properties
        .aggregate<{ _id: string; score: number }>([
          {
            $vectorSearch: {
              index: indexName,
              path,
              queryVector: query.vector,
              numCandidates: Math.min(1000, Math.max(100, query.limit * 10)),
              limit: query.limit,
              filter: toVectorSearchFilter(query.constraints, extra),
            },
          },
          { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
        ])
        .toArray();
      return { hits: hits.map((h) => ({ id: h._id, score: h.score })), mode: "atlas_vector_search" };
    } catch (error) {
      console.error(`[vector-search] ${indexName} failed, using in-app cosine:`, (error as Error).message);
    }
  }

  const vectorOf = (p: EngineProperty) => (query.space === "embedding" ? (p.embeddingModel === query.model ? p.embedding : undefined) : p.featureVector);
  const hits = query.catalog.engine
    .filter((p) => satisfiesHardConstraints(p, query.constraints))
    .map((p) => {
      const v = vectorOf(p);
      return v ? { id: p.id, score: (cosine(query.vector, v) + 1) / 2 } : null;
    })
    .filter((h): h is VectorHit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit);
  return { hits, mode: "in_app_cosine" };
}

/** The vector to use for a property in the catalog's active space (for "more like this" queries). */
export function propertyQueryVector(p: EngineProperty, catalog: Catalog): { space: "embedding" | "feature"; vector: number[]; model?: string } {
  if (catalog.space !== "local" && p.embedding && p.embeddingModel === catalog.space) {
    return { space: "embedding", vector: p.embedding, model: catalog.space };
  }
  return { space: "feature", vector: p.featureVector };
}
