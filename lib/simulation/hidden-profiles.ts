import type { InteractionType } from "@/lib/config/signals";
import { dimensionIndex } from "@/lib/features/dimensions";
import { gaussian } from "@/lib/utils/prng";
import type { CatalogStats, EngineProperty } from "@/lib/engine/types";

/**
 * Synthetic "hidden" users for testing the harness. The recommender never sees these
 * weights — it only sees the interactions they produce, which are always stored with
 * `simulated: true` and excluded from real-user metrics by default.
 */
export interface HiddenProfile {
  key: string;
  label: string;
  description: string;
  /** Utility weight per dimension, applied to catalog-centered feature values. */
  weights: Record<string, number>;
  /** Mid-stream taste change (tests recency handling). */
  shift?: { afterStep: number; weights: Record<string, number> };
  /** Utility threshold for a like; controls the like rate. */
  likeBias: number;
  /** Decision noise (std-dev of utility noise). */
  noise: number;
  /** What this user would say during onboarding (explicit preferences). */
  onboarding: { positive: string[]; negative: string[] };
}

export const HIDDEN_PROFILES: readonly HiddenProfile[] = [
  {
    key: "light_modernist",
    label: "Light-seeking modernist",
    description: "Wants bright, modern, renovated homes with hardwood and open kitchens; hates carpet, dark rooms and dated kitchens. Starts caring about outdoor space midway.",
    weights: { natural_light: 1.3, modern_interior: 0.8, hardwood: 0.6, open_kitchen: 0.6, renovated: 0.5, near_transit: 0.4, carpet: -1.2, dark_interior: -1.0, dated_kitchen: -0.9, dated_finishes: -0.4 },
    shift: { afterStep: 25, weights: { outdoor_space: 1.0, balcony: 0.7, high_rise: -0.4 } },
    likeBias: 0.6,
    noise: 0.45,
    onboarding: { positive: ["near_transit"], negative: [] },
  },
  {
    key: "classic_character",
    label: "Classic character lover",
    description: "Loves pre-war details, high ceilings, hardwood and quiet streets; dislikes glass towers and minimalist new construction.",
    weights: { traditional: 1.0, prewar: 0.9, high_ceilings: 0.7, hardwood: 0.7, quiet: 0.6, large_kitchen: 0.3, high_rise: -0.8, minimalist: -0.6, new_construction: -0.6, industrial: -0.4 },
    likeBias: 0.4,
    noise: 0.4,
    onboarding: { positive: ["quiet"], negative: [] },
  },
  {
    key: "space_seeker",
    label: "Space and outdoors seeker",
    description: "Prioritizes outdoor space, parking, big kitchens and quiet; indifferent to style, dislikes dense urban blocks.",
    weights: { outdoor_space: 1.2, parking: 0.9, spacious_layout: 0.8, large_kitchen: 0.6, quiet: 0.7, suburban_feel: 0.4, dense_urban: -0.8, high_rise: -0.6 },
    likeBias: 0,
    noise: 0.45,
    onboarding: { positive: ["parking"], negative: [] },
  },
];

export function getHiddenProfile(key: string): HiddenProfile | undefined {
  return HIDDEN_PROFILES.find((p) => p.key === key);
}

export interface SimulatedDecision {
  type: InteractionType;
  dwellMs: number;
  utility: number;
}

export function hiddenUtility(profile: HiddenProfile, property: EngineProperty, stats: CatalogStats, step: number): number {
  const weights = { ...profile.weights };
  if (profile.shift && step >= profile.shift.afterStep) {
    for (const [k, v] of Object.entries(profile.shift.weights)) weights[k] = (weights[k] ?? 0) + v;
  }
  let u = 0;
  for (const [key, w] of Object.entries(weights)) {
    const i = dimensionIndex(key);
    if (i >= 0) u += w * ((property.featureVector[i] ?? 0) - (stats.featureMean[i] ?? 0));
  }
  return u;
}

/** A noisy, deterministic (given rng) swipe decision from the hidden utility. */
export function simulateDecision(
  profile: HiddenProfile,
  property: EngineProperty,
  stats: CatalogStats,
  step: number,
  rng: () => number,
): SimulatedDecision {
  const utility = hiddenUtility(profile, property, stats, step) + gaussian(rng) * profile.noise;
  const margin = utility - profile.likeBias;
  if (margin > 0) {
    const type: InteractionType = margin > 1 && rng() < 0.5 ? "super_like" : margin > 0.6 && rng() < 0.3 ? "save" : "like";
    return { type, dwellMs: Math.round(3000 + rng() * 7000), utility };
  }
  const rapid = margin < -0.8;
  return { type: "dislike", dwellMs: Math.round(rapid ? 600 + rng() * 800 : 2000 + rng() * 5000), utility };
}
