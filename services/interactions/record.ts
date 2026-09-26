import "server-only";
import { ObjectId } from "mongodb";
import { HARNESS_CONFIG, LEARNING_CONFIG } from "@/lib/config/harness";
import { DECISIVE_OUTCOME, MEANINGFUL_TYPES, type CollectionKind } from "@/lib/config/signals";
import type { Label } from "@/lib/engine/types";
import { env } from "@/lib/env";
import { db } from "@/lib/mongodb/collections";
import type { InteractionDoc, InteractionInput } from "@/models/interaction";
import type { PropertyImpressionDoc, RecommendationPredictionDoc } from "@/models/recommendation";
import { saveToCollection, unsaveProperty } from "@/services/collections";
import { getOrCreateUser } from "@/services/users";

export interface ResolvedPrediction {
  predictionId: string;
  policyVersion: number;
  predictedLabel: Label;
  predictedLikeScore: number;
  actualLabel: Label;
  correct: boolean;
}

export interface RecordResult {
  interactionId: string;
  resolved?: ResolvedPrediction;
  preferenceUpdateDue: boolean;
  evolutionDue: boolean;
}

const IMPRESSION_MATCH_WINDOW_MS = 7 * 24 * 3600 * 1000;

/**
 * Records an interaction and, when it is a decisive outcome for a feed impression, resolves the
 * prediction that was persisted *before* the user acted into a labeled evaluation example.
 */
export async function recordInteraction(userId: string, input: InteractionInput, options: { simulated?: boolean } = {}): Promise<RecordResult> {
  const c = await db();
  const simulated = options.simulated ?? false;
  await getOrCreateUser(userId);

  if (input.propertyId) {
    const exists = await c.properties.countDocuments({ _id: input.propertyId }, { limit: 1 });
    if (!exists) throw new InteractionError(`Unknown property ${input.propertyId}`, 404);
  }

  let collectionKind: CollectionKind | undefined = input.collectionKind;
  if (input.type === "save" && input.propertyId) {
    const collectionId = typeof input.metadata?.collectionId === "string" && ObjectId.isValid(input.metadata.collectionId) ? new ObjectId(input.metadata.collectionId) : undefined;
    collectionKind = await saveToCollection(userId, input.propertyId, collectionId);
  }
  if (input.type === "unsave" && input.propertyId) await unsaveProperty(userId, input.propertyId);

  const outcome = DECISIVE_OUTCOME[input.type];
  let impression: PropertyImpressionDoc | null = null;
  if (input.impressionId) {
    impression = await c.propertyImpressions.findOne({ _id: new ObjectId(input.impressionId), userId });
  } else if (outcome && input.propertyId) {
    impression = await c.propertyImpressions.findOne(
      { userId, propertyId: input.propertyId, resolved: false, shownAt: { $gte: new Date(Date.now() - IMPRESSION_MATCH_WINDOW_MS) } },
      { sort: { shownAt: -1 } },
    );
  }

  const doc: InteractionDoc = {
    _id: new ObjectId(),
    userId,
    propertyId: input.propertyId,
    type: input.type,
    createdAt: new Date(),
    dwellMs: input.dwellMs,
    photosViewed: input.photosViewed,
    sourceSurface: input.sourceSurface,
    impressionId: impression?._id,
    collectionKind,
    simulated,
    metadata: input.metadata as InteractionDoc["metadata"],
  };
  try {
    await c.interactions.insertOne(doc);
  } catch (error) {
    // Duplicate reaction to the same impression (double-tap or retry): idempotent no-op.
    if ((error as { code?: number }).code === 11000 && impression) {
      const existing = await c.interactions.findOne({ impressionId: impression._id, type: input.type });
      if (existing) return { interactionId: existing._id.toHexString(), preferenceUpdateDue: false, evolutionDue: false };
    }
    throw error;
  }

  let resolved: ResolvedPrediction | undefined;
  if (outcome && impression && !impression.resolved) {
    // Atomic claim so a double-tap cannot resolve the same prediction twice.
    const claimed = await c.propertyImpressions.findOneAndUpdate({ _id: impression._id, resolved: false }, { $set: { resolved: true } });
    if (claimed) {
      const prediction: RecommendationPredictionDoc = {
        _id: new ObjectId(),
        userId,
        impressionId: impression._id,
        propertyId: impression.propertyId,
        recommendationSessionId: impression.recommendationSessionId,
        batchId: impression.batchId,
        policyVersion: impression.policyVersion,
        predictedLikeScore: impression.predictedLikeScore,
        calibratedLikeProbability: impression.calibratedLikeProbability,
        predictedLabel: impression.predictedLabel,
        actualLabel: outcome,
        correct: impression.predictedLabel === outcome,
        outcomeType: input.type,
        outcomeInteractionId: doc._id,
        rank: impression.rank,
        exploration: Boolean(impression.exploration),
        dwellMs: input.dwellMs,
        shownAt: impression.shownAt,
        resolvedAt: doc.createdAt,
        simulated: impression.simulated,
      };
      await c.recommendationPredictions.insertOne(prediction);
      if (impression.exploration) {
        await c.harnessExperiments.updateOne(
          { userId, kind: "exploration_probe", impressionId: impression._id },
          { $set: { outcome, status: "resolved", updatedAt: new Date() } },
        );
      }
      resolved = {
        predictionId: prediction._id.toHexString(),
        policyVersion: prediction.policyVersion,
        predictedLabel: prediction.predictedLabel,
        predictedLikeScore: prediction.predictedLikeScore,
        actualLabel: outcome,
        correct: prediction.correct,
      };
    }
  }

  const inc: Record<string, number> = {};
  if (MEANINGFUL_TYPES.includes(input.type)) inc["counters.meaningfulSinceUpdate"] = 1;
  if (resolved && !simulated) inc["counters.realResolvedSinceEvolution"] = 1;
  const user = Object.keys(inc).length > 0
    ? await c.users.findOneAndUpdate({ _id: userId }, { $inc: inc }, { returnDocument: "after" })
    : await c.users.findOne({ _id: userId });

  const meaningful = user?.counters.meaningfulSinceUpdate ?? 0;
  return {
    interactionId: doc._id.toHexString(),
    resolved,
    preferenceUpdateDue: input.type === "preference_correction" || meaningful >= LEARNING_CONFIG.preferenceUpdateEvery,
    evolutionDue: !simulated && env().HARNESS_AUTO_EVOLVE && (user?.counters.realResolvedSinceEvolution ?? 0) >= HARNESS_CONFIG.autoEvolveEvery,
  };
}

export class InteractionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
