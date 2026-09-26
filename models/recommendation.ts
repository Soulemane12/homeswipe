import type { ObjectId } from "mongodb";
import type { Label, ScoreBreakdown } from "@/lib/engine/types";

export type RetrievalMode = "atlas_vector_search" | "in_app_cosine";

export interface RecommendationSessionDoc {
  _id: ObjectId;
  userId: string;
  startedAt: Date;
  lastActiveAt: Date;
  policyVersion: number;
  surface: "discover" | "swipe";
  batches: number;
  impressions: number;
  retrievalMode: RetrievalMode;
  vectorSpace: string;
  generatorCounts: Record<string, number>;
  simulated: boolean;
}

export interface PropertyImpressionDoc {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  recommendationSessionId: ObjectId;
  batchId: string;
  shownAt: Date;
  rank: number;
  surface: "discover" | "swipe";
  policyVersion: number;
  /** Raw model score in [0, 1] — not a probability. */
  predictedLikeScore: number;
  /** Present only when a Platt calibration fit on ≥30 outcomes exists for this policy version. */
  calibratedLikeProbability?: number;
  predictedLabel: Label;
  scoreBreakdown: ScoreBreakdown;
  generators: string[];
  exploration?: { strategy: string; targetDimension?: string };
  resolved: boolean;
  simulated: boolean;
}

export interface RecommendationPredictionDoc {
  _id: ObjectId;
  userId: string;
  impressionId: ObjectId;
  propertyId: string;
  recommendationSessionId: ObjectId;
  batchId: string;
  policyVersion: number;
  predictedLikeScore: number;
  calibratedLikeProbability?: number;
  predictedLabel: Label;
  actualLabel: Label;
  correct: boolean;
  outcomeType: string;
  outcomeInteractionId: ObjectId;
  rank: number;
  exploration: boolean;
  dwellMs?: number;
  shownAt: Date;
  resolvedAt: Date;
  simulated: boolean;
}
