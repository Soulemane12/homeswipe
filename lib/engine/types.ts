import type { CollectionKind, InteractionType } from "@/lib/config/signals";
import type { Borough, PropertyType } from "@/models/property";

export type Label = "LIKE" | "DISLIKE";

/** Slim, framework-free property representation used by all engine math. */
export interface EngineProperty {
  id: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: PropertyType;
  borough: Borough;
  neighborhood: string;
  listingType: "sale" | "rent";
  status: "active" | "pending" | "sold";
  listedAt: Date;
  latitude: number;
  longitude: number;
  features: Record<string, number>;
  featureVector: number[];
  embedding?: number[];
  embeddingModel?: string;
}

export type CorrectionStance = "important" | "neutral" | "not_important";
export type PreferenceDirection = "positive" | "negative";

export interface ExplicitCorrection {
  dimension: string;
  stance: CorrectionStance;
  direction: PreferenceDirection;
}

export interface EngineInteraction {
  id: string;
  propertyId?: string;
  type: InteractionType;
  createdAt: Date;
  dwellMs?: number;
  collectionKind?: CollectionKind;
  simulated: boolean;
  /** Per-dimension evidence multipliers set by a later correction ("not the kitchen" → 0). */
  attribution?: Record<string, number>;
  corrections?: ExplicitCorrection[];
  /** For corrections: the interaction whose attribution is being corrected. */
  targetInteractionId?: string;
}

/**
 * Which vector space semantic scoring uses. "local" = deterministic feature vectors;
 * otherwise the embedding model name (e.g. "voyage-4"), only used when every property has one.
 */
export type VectorSpace = "local" | string;

export interface CatalogStats {
  featureMean: number[];
  featureStd: number[];
  embeddingMean?: number[];
  count: number;
}

export interface DimensionState {
  key: string;
  longTerm: number;
  recent: number;
  confidence: number;
  evidenceCount: number;
  positiveEvidence: string[];
  negativeEvidence: string[];
  lastEvidenceAt?: Date;
  explicit?: { value: number; source: "onboarding" | "correction"; stance?: CorrectionStance };
}

export interface Anchor {
  propertyId: string;
  weight: number;
  recent: boolean;
}

export interface PreferenceState {
  dimensions: Record<string, DimensionState>;
  positiveAnchors: Anchor[];
  negativeAnchors: Anchor[];
  /** Normalized, centered preference vector in `space`; null before any evidence. */
  semanticVector: number[] | null;
  space: VectorSpace;
  interactionCount: number;
  evidenceCount: number;
  simulatedCount: number;
}

export const RANKING_COMPONENTS = [
  "semantic",
  "explicit",
  "inferred",
  "visual",
  "behavior",
  "metadata",
  "freshness",
  "exploration",
] as const;
export type RankingComponent = (typeof RANKING_COMPONENTS)[number];

/** Components that estimate fit (and therefore drive the like prediction). */
export const PREDICTIVE_COMPONENTS = ["semantic", "explicit", "inferred", "visual", "behavior", "metadata"] as const;
export type PredictiveComponent = (typeof PREDICTIVE_COMPONENTS)[number];

export type ComponentScores = Record<RankingComponent, number>;

export interface ScoreBreakdown extends ComponentScores {
  /** Weighted fit over predictive components, in [0, 1]. Drives prediction and match %. */
  fit: number;
  /** Full ranking score including freshness and exploration bonuses. */
  total: number;
}

export interface Reason {
  dimension: string;
  text: string;
  contribution: number;
}

export interface ScoredProperty {
  propertyId: string;
  breakdown: ScoreBreakdown;
  reasons: Reason[];
  tradeoffs: Reason[];
}
