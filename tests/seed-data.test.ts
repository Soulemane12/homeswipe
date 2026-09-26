import { describe, expect, it } from "vitest";
import seed from "@/data/seed-properties.json";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { DIMENSION_KEYS, FEATURE_DIM } from "@/lib/features/dimensions";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { IMAGE_POOLS } from "@/lib/seed/image-library";
import { generateSeedProperties } from "@/lib/seed/generate";
import { PropertySchema } from "@/models/property";
import { loadSeedEngineProperties } from "./helpers/offline-sim";

describe("seed dataset", () => {
  const properties = (seed as unknown[]).map((p) => PropertySchema.parse(p));

  it("has 75–150 valid, uniquely identified listings", () => {
    expect(properties.length).toBeGreaterThanOrEqual(75);
    expect(properties.length).toBeLessThanOrEqual(150);
    expect(new Set(properties.map((p) => p.id)).size).toBe(properties.length);
  });

  it("matches the deterministic generator", () => {
    const regenerated = generateSeedProperties();
    expect(JSON.parse(JSON.stringify(regenerated))).toEqual(seed);
  });

  it("uses fixed-length feature vectors over allowed dimensions only", () => {
    for (const p of properties) {
      expect(p.ai.featureVector).toHaveLength(FEATURE_DIM);
      expect(Object.keys(p.ai.features).every(isAllowedDimension)).toBe(true);
    }
  });

  it("varies meaningfully on the dimensions preference learning depends on", () => {
    const stats = computeCatalogStats(loadSeedEngineProperties());
    for (const key of ["modern_interior", "natural_light", "hardwood", "carpet", "open_kitchen", "balcony", "outdoor_space", "high_rise", "near_transit", "renovated"]) {
      expect(stats.featureStd[DIMENSION_KEYS.indexOf(key)], key).toBeGreaterThan(0.15);
    }
  });

  it("only uses curated, verified images", () => {
    const allowed = new Set<string>(Object.values(IMAGE_POOLS).flat());
    for (const p of properties) {
      expect(p.media.length).toBeGreaterThan(0);
      for (const m of p.media) expect(allowed.has(/photo-([\w-]+)\?/.exec(m.url)![1])).toBe(true);
    }
  });

  it("covers all five boroughs", () => {
    expect(new Set(properties.map((p) => p.address.borough)).size).toBe(5);
  });
});
