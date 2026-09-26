import type { Label, ScoreBreakdown } from "@/lib/engine/types";
import type { Borough, PropertyType } from "./property";

/** Client-safe property summary. Frontend components never see raw provider or DB documents. */
export interface PropertyCardData {
  id: string;
  headline: string;
  price: number;
  neighborhood: string;
  borough: Borough;
  formattedAddress: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: PropertyType;
  hoa?: number;
  latitude: number;
  longitude: number;
  media: { url: string; alt: string }[];
  saved?: boolean;
  impressionId?: string;
  match?: {
    percent: number;
    reasons: string[];
    tradeoffs: string[];
  };
  /** Present only in judge mode. */
  judge?: {
    predictedLikeScore: number;
    calibratedLikeProbability?: number;
    predictedLabel: Label;
    policyVersion: number;
    breakdown: ScoreBreakdown;
    generators: string[];
    exploration?: { strategy: string; targetDimension?: string };
  };
}
