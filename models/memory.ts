import type { ObjectId } from "mongodb";

export const MEMORY_TYPES = [
  "hard_constraint",
  "explicit_positive",
  "explicit_negative",
  "inferred_positive",
  "inferred_negative",
  "behavioral",
  "recent",
  "uncertainty",
  "experiment_learning",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface PreferenceMemoryDoc {
  _id: ObjectId;
  userId: string;
  type: MemoryType;
  key: string;
  statement: string;
  strength: number;
  confidence: number;
  evidenceCount: number;
  supportingPropertyIds: string[];
  /** Archived memories are kept for long-horizon history instead of being deleted. */
  status: "active" | "archived";
  includesSimulated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreferenceDimensionDoc {
  _id: ObjectId;
  userId: string;
  dimension: string;
  direction: "positive" | "negative" | "neutral";
  /** Effective strength under the active policy, in [-1, 1]. */
  strength: number;
  longTermStrength: number;
  recentStrength: number;
  confidence: number;
  evidenceCount: number;
  source: "inferred" | "onboarding" | "correction";
  stance?: "important" | "neutral" | "not_important";
  positiveEvidence: string[];
  negativeEvidence: string[];
  lastEvidenceAt?: Date;
  updatedAt: Date;
}
