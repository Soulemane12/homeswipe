import { describe, expect, it } from "vitest";
import { parseCommandHeuristic } from "@/lib/command/parse";
import { parseSearchQueryHeuristic } from "@/lib/search/parse-query";

describe("search query parsing", () => {
  it("separates hard constraints from soft desires", () => {
    const q = parseSearchQueryHeuristic("Show modern 2-bedroom condos below $800k in Brooklyn");
    expect(q.constraints).toMatchObject({ maxPrice: 800_000, minBedrooms: 2, propertyTypes: ["condo"], boroughs: ["Brooklyn"] });
    expect(q.desired).toContain("modern_interior");
  });

  it("understands millions, ranges, baths and negations", () => {
    expect(parseSearchQueryHeuristic("under 1.2m").constraints.maxPrice).toBe(1_200_000);
    expect(parseSearchQueryHeuristic("between $600k and $900k").constraints).toMatchObject({ minPrice: 600_000, maxPrice: 900_000 });
    expect(parseSearchQueryHeuristic("2 bath loft").constraints.minBathrooms).toBe(2);
    const q = parseSearchQueryHeuristic("bright place with no carpet near transit");
    expect(q.desired).toEqual(expect.arrayContaining(["natural_light", "near_transit"]));
    expect(q.avoided).toContain("carpet");
  });

  it("recognizes neighborhoods and aliases", () => {
    expect(parseSearchQueryHeuristic("loft in DUMBO or LIC").constraints.neighborhoods).toEqual(expect.arrayContaining(["DUMBO", "Long Island City"]));
  });
});

describe("command parsing", () => {
  const ctx = { propertyId: "hs-0001" };

  it("turns refinements of the current home into similar-search actions", () => {
    expect(parseCommandHeuristic("Find something like this but cheaper", ctx)).toMatchObject({ kind: "similar", cheaper: true, anchorPropertyId: "hs-0001" });
    expect(parseCommandHeuristic("Keep this style but closer to Manhattan", ctx)).toMatchObject({ kind: "similar", closerTo: "Manhattan" });
    expect(parseCommandHeuristic("I like this kitchen but not the neighborhood", ctx)).toMatchObject({ kind: "similar", avoidSameNeighborhood: true });
  });

  it("parses explanations and corrections", () => {
    expect(parseCommandHeuristic("Why do you think I would like this?", ctx)).toMatchObject({ kind: "explain" });
    const correction = parseCommandHeuristic("I don't dislike this because of the kitchen. I dislike the carpet.", ctx);
    expect(correction).toMatchObject({ kind: "correction", direction: "negative" });
    if (correction.kind === "correction") {
      expect(correction.notBecauseOf).toContain("kitchen");
      expect(correction.because).toContain("carpet");
    }
  });

  it("parses stated preferences and falls back to search", () => {
    expect(parseCommandHeuristic("I love balconies", {})).toMatchObject({ kind: "preference", corrections: [{ dimension: "balcony", stance: "important", direction: "positive" }] });
    expect(parseCommandHeuristic("I don't care about parking", {})).toMatchObject({ kind: "preference", corrections: [{ dimension: "parking", stance: "not_important" }] });
    expect(parseCommandHeuristic("Show modern 2-bedroom condos below $800k", {})).toMatchObject({ kind: "search" });
  });
});
