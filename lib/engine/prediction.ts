import { clamp, sigmoid } from "@/lib/utils/math";
import type { HarnessPolicy } from "./policy-schema";
import type { Label } from "./types";

export interface Prediction {
  /**
   * Model score in [0, 1]. This is NOT an empirical probability — it becomes one only after
   * calibration against historical outcomes (see calibration.ts).
   */
  predictedLikeScore: number;
  predictedLabel: Label;
}

export function predictLike(fit: number, prediction: HarnessPolicy["prediction"]): Prediction {
  const predictedLikeScore = sigmoid(prediction.sharpness * (fit - prediction.threshold));
  return { predictedLikeScore, predictedLabel: predictedLikeScore >= 0.5 ? "LIKE" : "DISLIKE" };
}

/**
 * Consumer-facing match percentage: a fixed, monotonic linear map of the fit score from
 * [0.2, 0.9] onto [40%, 98%] (fit 0.50 → 65%, 0.75 → 86%), clamped to [35, 99]. Deterministic
 * and derived only from the ranking score — never random.
 */
export function displayMatch(fit: number): number {
  return Math.round(clamp(40 + ((fit - 0.2) / 0.7) * 58, 35, 99));
}
