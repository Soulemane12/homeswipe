import "server-only";
import type { ExplicitCorrection } from "@/lib/engine/types";
import { DIMENSION_GROUPS } from "@/lib/features/dimensions";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { db } from "@/lib/mongodb/collections";
import type { SourceSurface } from "@/models/interaction";
import { recordInteraction } from "@/services/interactions/record";
import { updatePreferences, type PreferenceUpdateResult } from "./update";

export interface CorrectionRequest {
  corrections: ExplicitCorrection[];
  /** Property the correction is about ("I dislike this because of…"). */
  propertyId?: string;
  /** Dimension groups or keys that should NOT be blamed/credited for the earlier reaction. */
  notBecauseOf?: string[];
  /** Dimensions that were the actual reason (evidence weight boosted). */
  because?: string[];
  text?: string;
  sourceSurface: SourceSurface;
}

function expand(keys: string[]): string[] {
  return keys.flatMap((k) => DIMENSION_GROUPS[k] ?? [k]).filter(isAllowedDimension);
}

/**
 * Explicit corrections outweigh inferred behavior: they are stored as a high-confidence
 * preference_correction interaction (with per-dimension attribution for the reaction being
 * corrected) and applied immediately rather than waiting for the next batched update.
 */
export async function applyCorrection(userId: string, request: CorrectionRequest): Promise<PreferenceUpdateResult & { interactionId: string }> {
  const corrections = request.corrections.filter((c) => isAllowedDimension(c.dimension));
  const attribution: Record<string, number> = {};
  for (const key of expand(request.notBecauseOf ?? [])) attribution[key] = 0;
  for (const key of expand(request.because ?? [])) attribution[key] = 1.5;

  let targetInteractionId: string | undefined;
  if (request.propertyId && Object.keys(attribution).length > 0) {
    const c = await db();
    const target = await c.interactions.findOne(
      { userId, propertyId: request.propertyId, type: { $in: ["dislike", "like", "super_like", "save"] } },
      { sort: { createdAt: -1 } },
    );
    targetInteractionId = target?._id.toHexString();
  }

  const recorded = await recordInteraction(userId, {
    type: "preference_correction",
    propertyId: request.propertyId,
    sourceSurface: request.sourceSurface,
    metadata: {
      corrections,
      attribution: targetInteractionId ? attribution : undefined,
      targetInteractionId,
      text: request.text?.slice(0, 500),
    },
  });
  const update = await updatePreferences(userId);
  return { ...update, interactionId: recorded.interactionId };
}
