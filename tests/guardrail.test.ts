import { describe, expect, it } from "vitest";
import { checkDimensionKey, checkPreferenceText, filterAllowedRecord, isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { DIMENSION_KEYS } from "@/lib/features/dimensions";

describe("fair-housing guardrail", () => {
  it("blocks protected-class traits and common proxies", () => {
    for (const key of ["family_friendly", "near_church", "white_neighborhood", "good_school_district", "kid_friendly", "senior_community", "diverse_area", "immigrant_community", "safe_neighborhood", "mosque_nearby", "singles_scene"]) {
      expect(isAllowedDimension(key), key).toBe(false);
    }
  });

  it("allows physical attributes, including look-alike words", () => {
    for (const key of ["elevator", "natural_light", "white_walls", "black_fixtures", "single_family", "walkability", "near_transit"]) {
      expect(isAllowedDimension(key), key).toBe(true);
    }
  });

  it("allows every built-in dimension", () => {
    for (const key of DIMENSION_KEYS) expect(checkDimensionKey(key).allowed, key).toBe(true);
  });

  it("rejects malformed keys", () => {
    expect(isAllowedDimension("Natural Light")).toBe(false);
    expect(isAllowedDimension("x")).toBe(false);
  });

  it("filters free-text statements and records", () => {
    expect(checkPreferenceText("Prefers homes with strong natural light.").allowed).toBe(true);
    expect(checkPreferenceText("Prefers neighborhoods with young families").allowed).toBe(false);
    expect(filterAllowedRecord({ natural_light: 2, church_nearby: 3 })).toEqual({ kept: { natural_light: 2 }, rejected: ["church_nearby"] });
  });
});
