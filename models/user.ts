import { z } from "zod";
import type { PreferenceState } from "@/lib/engine/types";
import { BOROUGHS, LISTING_TYPES, PROPERTY_TYPES } from "./property";

export const DEMO_USER_ID = "demo-user";

export const HardConstraintsSchema = z.object({
  listingType: z.enum(LISTING_TYPES).default("sale"),
  minPrice: z.number().int().nonnegative().optional(),
  maxPrice: z.number().int().positive().optional(),
  minBedrooms: z.number().int().min(0).max(10).default(0),
  minBathrooms: z.number().min(0).max(10).default(0),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).default([]),
  boroughs: z.array(z.enum(BOROUGHS)).default([]),
  neighborhoods: z.array(z.string()).default([]),
});
export type HardConstraints = z.infer<typeof HardConstraintsSchema>;

export const ExplicitPreferencesSchema = z.object({
  positive: z.array(z.string()).default([]),
  negative: z.array(z.string()).default([]),
});
export type ExplicitPreferences = z.infer<typeof ExplicitPreferencesSchema>;

export interface PreferenceProfile {
  summary: string;
  /** Stable signature of the strongest dimensions; the embedding regenerates only when it changes. */
  signature: string;
  embedding?: number[];
  embeddingModel?: string;
  /** Signed preference vector in the local feature space (used for feature-index retrieval). */
  localVector: number[];
  includesSimulated: boolean;
  updatedAt: Date;
}

/** Persisted snapshot of the learned preference state (the recommender's working memory). */
export interface StoredPreferenceState {
  state: PreferenceState;
  policyVersion: number;
  interactionCount: number;
  computedAt: Date;
}

export interface UserDoc {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  onboardingCompletedAt?: Date;
  constraints: HardConstraints;
  explicitPreferences: ExplicitPreferences;
  preferenceProfile?: PreferenceProfile;
  preferenceState?: StoredPreferenceState;
  activePolicyVersion: number;
  counters: {
    meaningfulSinceUpdate: number;
    realResolvedSinceEvolution: number;
  };
  harnessLockUntil?: Date;
  lastSeenAt?: Date;
}
