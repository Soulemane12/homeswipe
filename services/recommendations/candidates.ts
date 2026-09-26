import "server-only";
import { satisfiesHardConstraints, toMongoFilter } from "@/lib/engine/constraints";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import { preferenceWeights } from "@/lib/engine/preference-state";
import type { EngineProperty, PreferenceState } from "@/lib/engine/types";
import { db } from "@/lib/mongodb/collections";
import { createRng, hashString, shuffle } from "@/lib/utils/prng";
import type { RetrievalMode } from "@/models/recommendation";
import type { UserDoc } from "@/models/user";
import type { Catalog } from "@/services/properties/repository";
import { propertyQueryVector, vectorSearch } from "@/services/search/vector";

export interface CandidateContext {
  user: UserDoc;
  policy: HarnessPolicy;
  catalog: Catalog;
  state: PreferenceState;
  exclude: Set<string>;
  savedIds: string[];
  seed: string;
}

export interface CandidatePool {
  /** propertyId → generators that produced it. */
  sources: Map<string, Set<string>>;
  retrievalMode: RetrievalMode;
  eligibleCount: number;
}

/**
 * Multi-source candidate generation. Each enabled generator (per the active policy) contributes
 * a bounded slice; results are deduplicated and tagged with their generator(s) so ranking and
 * the lab can see where every recommendation came from. The full catalog is never ranked.
 */
export async function generateCandidates(ctx: CandidateContext): Promise<CandidatePool> {
  const { policy, catalog, state, user, exclude } = ctx;
  const constraints = user.constraints;
  const gens = policy.candidateGenerators;
  const sources = new Map<string, Set<string>>();
  let usedAtlas = false;
  const add = (id: string, generator: string) => {
    if (exclude.has(id)) return;
    const set = sources.get(id) ?? new Set<string>();
    set.add(generator);
    sources.set(id, set);
  };
  const overFetch = (limit: number) => limit + exclude.size;
  const eligible = catalog.engine.filter((p) => !exclude.has(p.id) && satisfiesHardConstraints(p, constraints));

  const tasks: Promise<void>[] = [];

  if (gens.semantic.enabled) {
    tasks.push(
      (async () => {
        const profile = user.preferenceProfile;
        const useEmbedding = catalog.space !== "local" && profile?.embedding && profile.embeddingModel === catalog.space;
        const vector = useEmbedding ? profile!.embedding! : (profile?.localVector ?? preferenceWeights(state, policy));
        const { hits, mode } = await vectorSearch({
          space: useEmbedding ? "embedding" : "feature",
          vector,
          model: useEmbedding ? catalog.space : undefined,
          constraints,
          limit: overFetch(gens.semantic.limit),
          catalog,
        });
        if (mode === "atlas_vector_search") usedAtlas = true;
        hits.forEach((h) => add(h.id, "semantic"));
      })(),
    );
  }

  const anchorSearch = async (anchorIds: string[], limit: number, generator: string) => {
    const anchors = anchorIds.map((id) => catalog.byId.get(id)).filter((p): p is EngineProperty => p !== undefined).slice(0, 3);
    if (anchors.length === 0) return;
    const perAnchor = Math.max(3, Math.ceil(limit / anchors.length));
    for (const anchor of anchors) {
      const q = propertyQueryVector(anchor, catalog);
      const { hits, mode } = await vectorSearch({ ...q, constraints, limit: overFetch(perAnchor) + 1, catalog });
      if (mode === "atlas_vector_search") usedAtlas = true;
      hits.filter((h) => h.id !== anchor.id).forEach((h) => add(h.id, generator));
    }
  };

  if (gens.similarLiked.enabled) {
    const recentPositive = [...state.positiveAnchors].reverse().map((a) => a.propertyId);
    tasks.push(anchorSearch([...new Set(recentPositive)], gens.similarLiked.limit, "similarLiked"));
  }
  if (gens.savedAnchor.enabled && ctx.savedIds.length > 0) {
    tasks.push(anchorSearch(ctx.savedIds, gens.savedAnchor.limit, "savedAnchor"));
  }

  if (gens.geo.enabled && state.positiveAnchors.length > 0) {
    tasks.push(
      (async () => {
        const anchors = state.positiveAnchors.map((a) => catalog.byId.get(a.propertyId)).filter((p): p is EngineProperty => p !== undefined);
        if (anchors.length === 0) return;
        const lat = anchors.reduce((s, p) => s + p.latitude, 0) / anchors.length;
        const lng = anchors.reduce((s, p) => s + p.longitude, 0) / anchors.length;
        const c = await db();
        const docs = await c.properties
          .aggregate<{ _id: string }>([
            { $geoNear: { near: { type: "Point", coordinates: [lng, lat] }, distanceField: "distance", key: "address.location", maxDistance: 6000, query: toMongoFilter(constraints) } },
            { $limit: overFetch(gens.geo.limit) },
            { $project: { _id: 1 } },
          ])
          .toArray();
        docs.forEach((d) => add(d._id, "geo"));
      })(),
    );
  }

  await Promise.all(tasks);

  if (gens.fresh.enabled) {
    [...eligible].sort((a, b) => b.listedAt.getTime() - a.listedAt.getTime()).slice(0, gens.fresh.limit).forEach((p) => add(p.id, "fresh"));
  }
  if (gens.exploration.enabled) {
    shuffle(createRng(hashString(`explore:${ctx.seed}`)), eligible).slice(0, gens.exploration.limit).forEach((p) => add(p.id, "exploration"));
  }
  // Backfill so a narrow policy never starves the feed.
  if (sources.size < 20) {
    [...eligible].sort((a, b) => b.listedAt.getTime() - a.listedAt.getTime()).slice(0, 20).forEach((p) => add(p.id, "backfill"));
  }

  return { sources, retrievalMode: usedAtlas ? "atlas_vector_search" : "in_app_cosine", eligibleCount: eligible.length };
}
