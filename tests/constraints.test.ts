import { describe, expect, it } from "vitest";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { mergeConstraints, satisfiesHardConstraints, toMongoFilter, toVectorSearchFilter } from "@/lib/engine/constraints";
import { INITIAL_POLICY } from "@/lib/engine/policy-schema";
import { buildPreferenceState } from "@/lib/engine/preference-state";
import { rankCandidates } from "@/lib/engine/rank";
import { ANY, makeProperty } from "./helpers/fixtures";

describe("hard constraints", () => {
  const c = { ...ANY, maxPrice: 800_000, minBedrooms: 2, minBathrooms: 1, propertyTypes: ["condo" as const], boroughs: ["Brooklyn" as const] };

  it("accepts properties inside every limit and rejects each violation", () => {
    expect(satisfiesHardConstraints(makeProperty({ price: 800_000 }), c)).toBe(true);
    expect(satisfiesHardConstraints(makeProperty({ price: 800_001 }), c)).toBe(false);
    expect(satisfiesHardConstraints(makeProperty({ price: 700_000, bedrooms: 1 }), c)).toBe(false);
    expect(satisfiesHardConstraints(makeProperty({ price: 700_000, bathrooms: 0.5 }), c)).toBe(false);
    expect(satisfiesHardConstraints(makeProperty({ price: 700_000, propertyType: "co-op" }), c)).toBe(false);
    expect(satisfiesHardConstraints(makeProperty({ price: 700_000, borough: "Queens" }), c)).toBe(false);
    expect(satisfiesHardConstraints(makeProperty({ price: 700_000, status: "sold" }), c)).toBe(false);
  });

  it("builds equivalent MongoDB and Vector Search prefilters", () => {
    expect(toMongoFilter(c)).toEqual({
      status: "active",
      listingType: "sale",
      "financial.price": { $lte: 800_000 },
      "facts.bedrooms": { $gte: 2 },
      "facts.bathrooms": { $gte: 1 },
      "facts.propertyType": { $in: ["condo"] },
      "address.borough": { $in: ["Brooklyn"] },
    });
    const vs = toVectorSearchFilter(c) as { $and: Record<string, unknown>[] };
    expect(vs.$and).toContainEqual({ "financial.price": { $lte: 800_000 } });
    expect(vs.$and).toContainEqual({ "facts.bedrooms": { $gte: 2 } });
  });

  it("lets explicit search values win when merging", () => {
    const merged = mergeConstraints(c, { maxPrice: 1_000_000, boroughs: [] });
    expect(merged.maxPrice).toBe(1_000_000);
    expect(merged.boroughs).toEqual(["Brooklyn"]);
  });

  it("never ranks a property that violates constraints, even if it is the best match", () => {
    const tooExpensive = makeProperty({ id: "dream", price: 5_000_000, f: { natural_light: 1, modern_interior: 1 } });
    const ok = [1, 2, 3].map((i) => makeProperty({ id: `ok${i}`, price: 700_000 }));
    const all = [tooExpensive, ...ok];
    const stats = computeCatalogStats(all);
    const properties = new Map(all.map((p) => [p.id, p]));
    const state = buildPreferenceState({ interactions: [], properties, stats, memoryPolicy: INITIAL_POLICY.memoryPolicy, explicit: { positive: ["natural_light"], negative: [] }, space: "local" });
    const result = rankCandidates({ candidates: all, ctx: { state, policy: INITIAL_POLICY, stats, constraints: c, properties, now: new Date() }, limit: 4, seed: "t" });
    expect(result.items.map((i) => i.scored.propertyId)).not.toContain("dream");
    expect(result.constraintViolations).toBe(1);
  });
});
