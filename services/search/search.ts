import "server-only";
import { z } from "zod";
import { satisfiesHardConstraints } from "@/lib/engine/constraints";
import type { EngineProperty } from "@/lib/engine/types";
import { embedText } from "@/lib/embeddings/provider";
import { localPreferenceVector } from "@/lib/embeddings/local";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import type { PropertyCardData } from "@/models/card";
import { BOROUGHS, PROPERTY_TYPES } from "@/models/property";
import type { RetrievalMode } from "@/models/recommendation";
import type { HardConstraints } from "@/models/user";
import { savedPropertyIds } from "@/services/collections";
import { toCard } from "@/services/properties/cards";
import { getPersonalContext } from "@/services/recommendations/personalize";
import { parseSearchQuery } from "./parse";
import { propertyQueryVector, vectorSearch, type VectorHit } from "./vector";

export const SearchFiltersSchema = z.object({
  boroughs: z.array(z.enum(BOROUGHS)).optional(),
  neighborhoods: z.array(z.string().max(60)).max(30).optional(),
  excludeNeighborhoods: z.array(z.string().max(60)).max(10).optional(),
  minPrice: z.number().int().nonnegative().optional(),
  maxPrice: z.number().int().positive().optional(),
  minBedrooms: z.number().int().min(0).max(10).optional(),
  minBathrooms: z.number().min(0).max(10).optional(),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).optional(),
  minSqft: z.number().int().positive().optional(),
  maxHoa: z.number().int().nonnegative().optional(),
  minYearBuilt: z.number().int().min(1800).max(2100).optional(),
  features: z.array(z.string()).max(12).optional(),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export const SearchRequestSchema = z.object({
  query: z.string().trim().max(300).optional(),
  filters: SearchFiltersSchema.default({}),
  similarTo: z.string().optional(),
  /** Filter keys the user removed from the parsed-query chips; parsing must not re-add them. */
  ignoreQueryFilters: z.array(z.string()).max(10).default([]),
  limit: z.number().int().min(1).max(60).default(24),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export interface SearchResponse {
  results: PropertyCardData[];
  total: number;
  appliedFilters: SearchFilters;
  /** Filters that came from the natural-language query (shown as removable chips). */
  queryFilters: Partial<SearchFilters>;
  desired: string[];
  avoided: string[];
  parser?: "llm" | "heuristic";
  retrievalMode: RetrievalMode | "filter_only";
  anchor?: PropertyCardData;
}

const FILTER_KEYS = ["minPrice", "maxPrice", "minBedrooms", "minBathrooms", "propertyTypes", "boroughs", "neighborhoods"] as const;

function isUnset(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * Search = explicit criteria first, personalization second. Explicit filter controls always
 * win over anything parsed from text; parsed constraints only fill filters the user left empty.
 */
export async function searchProperties(userId: string, request: SearchRequest): Promise<SearchResponse> {
  const ctx = await getPersonalContext(userId);
  const { catalog } = ctx;
  const parsed = request.query ? await parseSearchQuery(request.query) : null;

  const filters: SearchFilters = { ...request.filters };
  const queryFilters: Partial<SearchFilters> = {};
  if (parsed) {
    for (const key of FILTER_KEYS) {
      if (request.ignoreQueryFilters.includes(key)) continue;
      const value = parsed.constraints[key];
      if (!isUnset(value) && isUnset(filters[key])) {
        (filters as Record<string, unknown>)[key] = value;
        (queryFilters as Record<string, unknown>)[key] = value;
      }
    }
  }
  const constraints: HardConstraints = {
    listingType: "sale",
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    minBedrooms: filters.minBedrooms ?? 0,
    minBathrooms: filters.minBathrooms ?? 0,
    propertyTypes: filters.propertyTypes ?? [],
    boroughs: filters.boroughs ?? [],
    neighborhoods: filters.neighborhoods ?? [],
  };
  const featureFilter = (filters.features ?? []).filter(isAllowedDimension);
  const extraOk = (p: EngineProperty) => {
    const full = catalog.propertyById.get(p.id);
    if (!full) return false;
    if (filters.minSqft && (full.facts.sqft ?? 0) < filters.minSqft) return false;
    if (filters.maxHoa !== undefined && (full.financial.hoa ?? 0) > filters.maxHoa) return false;
    if (filters.minYearBuilt && (full.facts.yearBuilt ?? 0) < filters.minYearBuilt) return false;
    if (filters.excludeNeighborhoods?.includes(p.neighborhood)) return false;
    return featureFilter.every((f) => (p.features[f] ?? 0) >= 0.6);
  };

  let hits: VectorHit[] | null = null;
  let retrievalMode: SearchResponse["retrievalMode"] = "filter_only";
  const anchor = request.similarTo ? catalog.byId.get(request.similarTo) : undefined;
  const desired = parsed?.desired ?? [];
  const avoided = parsed?.avoided ?? [];

  if (anchor) {
    const q = propertyQueryVector(anchor, catalog);
    const res = await vectorSearch({ ...q, constraints, limit: 80, catalog });
    hits = res.hits.filter((h) => h.id !== anchor.id);
    retrievalMode = res.mode;
  } else if (parsed && (desired.length > 0 || avoided.length > 0 || catalog.space !== "local")) {
    let done = false;
    if (catalog.space !== "local") {
      const embedded = await embedText(parsed.semanticText, "query");
      if (embedded.space === "embedding" && embedded.model === catalog.space) {
        const res = await vectorSearch({ space: "embedding", vector: embedded.vector, model: catalog.space, constraints, limit: 80, catalog });
        hits = res.hits;
        retrievalMode = res.mode;
        done = true;
      }
    }
    if (!done && (desired.length > 0 || avoided.length > 0)) {
      const weights = Object.fromEntries([...desired.map((d) => [d, 1] as const), ...avoided.map((d) => [d, -1] as const)]);
      const res = await vectorSearch({ space: "feature", vector: localPreferenceVector(weights), constraints, limit: 80, catalog });
      hits = res.hits;
      retrievalMode = res.mode;
    }
  }

  const relevance = new Map((hits ?? []).map((h) => [h.id, h.score]));
  const pool = (hits ? hits.map((h) => catalog.byId.get(h.id)).filter((p): p is EngineProperty => p !== undefined) : catalog.engine.filter((p) => satisfiesHardConstraints(p, constraints)))
    .filter((p) => satisfiesHardConstraints(p, constraints) && extraOk(p));

  const saved = await savedPropertyIds(userId);
  const ranked = pool
    .map((p) => {
      const scored = ctx.scorer.score(p);
      const rel = relevance.get(p.id);
      const value = rel !== undefined ? 0.6 * rel + 0.4 * scored.breakdown.fit : scored.breakdown.fit;
      return { p, scored, value };
    })
    .sort((a, b) => b.value - a.value);

  const anchorProperty = anchor ? catalog.propertyById.get(anchor.id) : undefined;
  return {
    results: ranked.slice(0, request.limit).map(({ p, scored }) => toCard(catalog.propertyById.get(p.id)!, { scored, saved: saved.has(p.id) })),
    total: ranked.length,
    appliedFilters: filters,
    queryFilters,
    desired,
    avoided,
    parser: parsed?.parser,
    retrievalMode,
    anchor: anchorProperty ? toCard(anchorProperty, { scored: ctx.scorer.score(anchor!), saved: saved.has(anchor!.id) }) : undefined,
  };
}
