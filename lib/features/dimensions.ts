/**
 * Canonical preference dimensions. Every property is described by a value in [0, 1]
 * for each dimension, in this fixed order (the local feature vector). Dimensions describe
 * physical property characteristics and amenities only — never people (see guardrails).
 */
export type DimensionCategory = "visual" | "layout" | "amenity" | "building" | "location";

export interface DimensionDef {
  key: string;
  label: string;
  category: DimensionCategory;
  /** Short phrase used in "why this matches" reasons, e.g. "Strong natural light". */
  reason: string;
  /** Phrase used when the property lacks a wanted dimension or has an unwanted one. */
  tradeoff: string;
  /** Noun phrase for preference statements, e.g. "homes with strong natural light". */
  noun: string;
}

export const DIMENSIONS: readonly DimensionDef[] = [
  { key: "modern_interior", label: "Modern interiors", category: "visual", reason: "Modern interior", tradeoff: "Not a modern interior", noun: "modern interiors" },
  { key: "traditional", label: "Traditional character", category: "visual", reason: "Classic, traditional character", tradeoff: "Traditional styling", noun: "traditional character" },
  { key: "minimalist", label: "Minimalist design", category: "visual", reason: "Clean minimalist design", tradeoff: "Minimalist, sparse design", noun: "minimalist design" },
  { key: "industrial", label: "Industrial style", category: "visual", reason: "Industrial loft character", tradeoff: "Industrial styling", noun: "industrial loft style" },
  { key: "luxury", label: "Luxury finishes", category: "visual", reason: "Luxury finishes", tradeoff: "Luxury-level finishes", noun: "luxury finishes" },
  { key: "natural_light", label: "Natural light", category: "visual", reason: "Strong natural light", tradeoff: "Limited natural light", noun: "strong natural light" },
  { key: "dark_interior", label: "Dark interiors", category: "visual", reason: "Moody, darker interior", tradeoff: "Darker interior", noun: "darker interiors" },
  { key: "large_windows", label: "Large windows", category: "visual", reason: "Oversized windows", tradeoff: "Small windows", noun: "large windows" },
  { key: "hardwood", label: "Hardwood floors", category: "visual", reason: "Hardwood floors", tradeoff: "No hardwood floors", noun: "hardwood floors" },
  { key: "carpet", label: "Carpeting", category: "visual", reason: "Carpeted rooms", tradeoff: "Carpeted rooms", noun: "carpeted floors" },
  { key: "high_ceilings", label: "High ceilings", category: "visual", reason: "High ceilings", tradeoff: "Standard ceiling height", noun: "high ceilings" },
  { key: "exposed_brick", label: "Exposed brick", category: "visual", reason: "Exposed brick", tradeoff: "Exposed brick walls", noun: "exposed brick" },
  { key: "renovated", label: "Renovated", category: "visual", reason: "Recently renovated", tradeoff: "Needs updating", noun: "renovated homes" },
  { key: "dated_finishes", label: "Dated finishes", category: "visual", reason: "Original vintage finishes", tradeoff: "Dated finishes", noun: "dated finishes" },
  { key: "open_kitchen", label: "Open kitchen", category: "layout", reason: "Open kitchen", tradeoff: "Closed kitchen", noun: "open kitchens" },
  { key: "large_kitchen", label: "Large kitchen", category: "layout", reason: "Generous kitchen", tradeoff: "Compact kitchen", noun: "large kitchens" },
  { key: "dated_kitchen", label: "Dated kitchen", category: "layout", reason: "Original kitchen", tradeoff: "Dated kitchen", noun: "dated kitchens" },
  { key: "spacious_layout", label: "Spacious layout", category: "layout", reason: "Spacious layout", tradeoff: "Tight layout", noun: "spacious layouts" },
  { key: "home_office", label: "Home office space", category: "layout", reason: "Dedicated office nook", tradeoff: "No office space", noun: "a home office" },
  { key: "balcony", label: "Balcony", category: "amenity", reason: "Private balcony", tradeoff: "No balcony", noun: "a balcony" },
  { key: "outdoor_space", label: "Outdoor space", category: "amenity", reason: "Private outdoor space", tradeoff: "No outdoor space", noun: "private outdoor space" },
  { key: "parking", label: "Parking", category: "amenity", reason: "Parking included", tradeoff: "No parking", noun: "parking" },
  { key: "doorman", label: "Doorman", category: "amenity", reason: "Full-time doorman", tradeoff: "No doorman", noun: "a doorman building" },
  { key: "elevator", label: "Elevator", category: "amenity", reason: "Elevator building", tradeoff: "Walk-up", noun: "an elevator building" },
  { key: "gym", label: "Fitness center", category: "amenity", reason: "Building gym", tradeoff: "No building gym", noun: "a building gym" },
  { key: "in_unit_laundry", label: "In-unit laundry", category: "amenity", reason: "In-unit washer/dryer", tradeoff: "No in-unit laundry", noun: "in-unit laundry" },
  { key: "high_rise", label: "High-rise", category: "building", reason: "High-floor, high-rise living", tradeoff: "High-rise building", noun: "high-rise buildings" },
  { key: "low_rise", label: "Low-rise", category: "building", reason: "Low-rise building", tradeoff: "Low-rise building", noun: "low-rise buildings" },
  { key: "prewar", label: "Pre-war building", category: "building", reason: "Pre-war details", tradeoff: "Pre-war building", noun: "pre-war buildings" },
  { key: "new_construction", label: "New construction", category: "building", reason: "New construction", tradeoff: "Older building", noun: "new construction" },
  { key: "near_transit", label: "Near transit", category: "location", reason: "Steps to the subway", tradeoff: "Farther from transit", noun: "subway access" },
  { key: "walkability", label: "Walkability", category: "location", reason: "Very walkable block", tradeoff: "Car-dependent area", noun: "walkable neighborhoods" },
  { key: "quiet", label: "Quiet setting", category: "location", reason: "Quiet, tree-lined setting", tradeoff: "Busier street", noun: "quiet streets" },
  { key: "dense_urban", label: "Dense urban", category: "location", reason: "In the middle of the action", tradeoff: "Dense, busy area", noun: "dense urban energy" },
  { key: "suburban_feel", label: "Suburban feel", category: "location", reason: "Suburban calm", tradeoff: "Suburban setting", noun: "a suburban feel" },
  { key: "water_views", label: "Water views", category: "location", reason: "Water views", tradeoff: "No water views", noun: "water views" },
] as const;

export const DIMENSION_KEYS: readonly string[] = DIMENSIONS.map((d) => d.key);
export const FEATURE_DIM = DIMENSION_KEYS.length;
export const FEATURE_SPACE_VERSION = `local-feature-v1-${FEATURE_DIM}`;

const byKey = new Map(DIMENSIONS.map((d) => [d.key, d]));
const indexByKey = new Map(DIMENSION_KEYS.map((k, i) => [k, i]));

export function getDimension(key: string): DimensionDef | undefined {
  return byKey.get(key);
}

export function dimensionIndex(key: string): number {
  return indexByKey.get(key) ?? -1;
}

export function isKnownDimension(key: string): boolean {
  return byKey.has(key);
}

/** Label for any dimension key, including ones created at runtime. */
export function dimensionLabel(key: string): string {
  return byKey.get(key)?.label ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function dimensionNoun(key: string): string {
  return byKey.get(key)?.noun ?? key.replace(/_/g, " ");
}

export function isVisualDimension(key: string): boolean {
  return byKey.get(key)?.category === "visual";
}

/** Dimension groups that describe the same physical aspect (used by corrections: "not the kitchen"). */
export const DIMENSION_GROUPS: Record<string, readonly string[]> = {
  kitchen: ["open_kitchen", "large_kitchen", "dated_kitchen"],
  floors: ["hardwood", "carpet"],
  light: ["natural_light", "dark_interior", "large_windows"],
  style: ["modern_interior", "traditional", "minimalist", "industrial", "luxury"],
  building: ["high_rise", "low_rise", "prewar", "new_construction", "doorman", "elevator"],
  outdoor: ["balcony", "outdoor_space"],
  location: ["near_transit", "walkability", "quiet", "dense_urban", "suburban_feel"],
  finishes: ["renovated", "dated_finishes", "dated_kitchen"],
};

export function toFeatureVector(features: Record<string, number>): number[] {
  return DIMENSION_KEYS.map((k) => features[k] ?? 0);
}

export function fromFeatureVector(vector: ArrayLike<number>): Record<string, number> {
  const out: Record<string, number> = {};
  DIMENSION_KEYS.forEach((k, i) => {
    out[k] = vector[i] ?? 0;
  });
  return out;
}
