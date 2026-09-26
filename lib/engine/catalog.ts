import { FEATURE_DIM } from "@/lib/features/dimensions";
import type { CatalogStats, EngineProperty, VectorSpace } from "./types";

/** Mean/std of every feature (and embedding mean) over the catalog; used to center vectors. */
export function computeCatalogStats(properties: EngineProperty[], space: VectorSpace = "local"): CatalogStats {
  const n = properties.length;
  const featureMean = new Array<number>(FEATURE_DIM).fill(0);
  const featureStd = new Array<number>(FEATURE_DIM).fill(0);
  if (n === 0) return { featureMean, featureStd, count: 0 };
  for (const p of properties) {
    for (let i = 0; i < FEATURE_DIM; i++) featureMean[i] += (p.featureVector[i] ?? 0) / n;
  }
  for (const p of properties) {
    for (let i = 0; i < FEATURE_DIM; i++) featureStd[i] += ((p.featureVector[i] ?? 0) - featureMean[i]) ** 2 / n;
  }
  for (let i = 0; i < FEATURE_DIM; i++) featureStd[i] = Math.sqrt(featureStd[i]);

  let embeddingMean: number[] | undefined;
  if (space !== "local") {
    const withEmbedding = properties.filter((p) => p.embedding && p.embeddingModel === space);
    if (withEmbedding.length > 0) {
      const dim = withEmbedding[0].embedding!.length;
      embeddingMean = new Array<number>(dim).fill(0);
      for (const p of withEmbedding) {
        const e = p.embedding!;
        for (let i = 0; i < dim; i++) embeddingMean[i] += e[i] / withEmbedding.length;
      }
    }
  }
  return { featureMean, featureStd, embeddingMean, count: n };
}

export function centeredFeatures(p: EngineProperty, stats: CatalogStats): number[] {
  const out = new Array<number>(FEATURE_DIM);
  for (let i = 0; i < FEATURE_DIM; i++) out[i] = (p.featureVector[i] ?? 0) - stats.featureMean[i];
  return out;
}

/**
 * Centered vector for a property in the active space. Falls back to local features when the
 * property lacks an embedding for that space, so mixed catalogs never compare across spaces.
 */
export function centeredVector(p: EngineProperty, stats: CatalogStats, space: VectorSpace): number[] {
  if (space !== "local" && p.embedding && p.embeddingModel === space && stats.embeddingMean) {
    const mean = stats.embeddingMean;
    return p.embedding.map((v, i) => v - (mean[i] ?? 0));
  }
  return centeredFeatures(p, stats);
}

/** Picks the embedding space only when every active property shares one model's embedding. */
export function chooseVectorSpace(properties: EngineProperty[], preferredModel?: string): VectorSpace {
  if (!preferredModel || properties.length === 0) return "local";
  const allEmbedded = properties.every((p) => p.embedding && p.embeddingModel === preferredModel);
  return allEmbedded ? preferredModel : "local";
}
