import { FEATURE_DIM, dimensionIndex, toFeatureVector } from "@/lib/features/dimensions";
import { matchDimensions } from "@/lib/features/lexicon";

/**
 * Deterministic local "embedding": text → signed vector over the known feature dimensions.
 * Mentioned attributes get +1, negated ones −1. Used when no embedding API is configured, so
 * search, retrieval and the harness still have real quantitative signals.
 */
export function localTextVector(text: string): number[] {
  const vector = new Array<number>(FEATURE_DIM).fill(0);
  for (const match of matchDimensions(text)) {
    const i = dimensionIndex(match.dimension);
    if (i >= 0) vector[i] = match.negated ? -1 : 1;
  }
  return vector;
}

export function localPropertyVector(features: Record<string, number>): number[] {
  return toFeatureVector(features);
}

/** Signed weights (dimension → [-1, 1]) as a local-space query vector. */
export function localPreferenceVector(weights: Record<string, number>): number[] {
  const vector = new Array<number>(FEATURE_DIM).fill(0);
  for (const [key, value] of Object.entries(weights)) {
    const i = dimensionIndex(key);
    if (i >= 0) vector[i] = value;
  }
  return vector;
}
