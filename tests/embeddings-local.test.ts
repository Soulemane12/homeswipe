import { describe, expect, it } from "vitest";
import { localPreferenceVector, localTextVector } from "@/lib/embeddings/local";
import { dimensionIndex, FEATURE_DIM, fromFeatureVector, toFeatureVector } from "@/lib/features/dimensions";
import { matchDimensions } from "@/lib/features/lexicon";
import { cosine } from "@/lib/utils/math";

describe("deterministic local vectors", () => {
  it("maps text to a signed feature vector, respecting negation", () => {
    const v = localTextVector("bright modern condo near the subway, no carpet");
    expect(v).toHaveLength(FEATURE_DIM);
    expect(v[dimensionIndex("natural_light")]).toBe(1);
    expect(v[dimensionIndex("modern_interior")]).toBe(1);
    expect(v[dimensionIndex("near_transit")]).toBe(1);
    expect(v[dimensionIndex("carpet")]).toBe(-1);
  });

  it("is deterministic and round-trips feature maps", () => {
    expect(localTextVector("big kitchen with a balcony")).toEqual(localTextVector("big kitchen with a balcony"));
    const features = { natural_light: 0.9, carpet: 0.1 };
    const back = fromFeatureVector(toFeatureVector(features));
    expect(back.natural_light).toBe(0.9);
    expect(back.carpet).toBe(0.1);
    expect(back.balcony).toBe(0);
  });

  it("prefers longer phrases over overlapping shorter ones", () => {
    const dims = matchDimensions("an original dated kitchen").map((m) => m.dimension);
    expect(dims).toContain("dated_kitchen");
  });

  it("produces query vectors that point toward matching properties", () => {
    const query = localPreferenceVector({ natural_light: 1, dark_interior: -1 });
    const bright = toFeatureVector({ natural_light: 0.9, dark_interior: 0.05 });
    const dark = toFeatureVector({ natural_light: 0.1, dark_interior: 0.9 });
    expect(cosine(query, bright)).toBeGreaterThan(cosine(query, dark));
  });
});
