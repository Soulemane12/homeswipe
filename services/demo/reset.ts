import "server-only";
import { db } from "@/lib/mongodb/collections";
import { invalidateCalibration } from "@/services/harness/calibration";
import { ensureInitialPolicy } from "@/services/harness/policies";
import { ensureDefaultCollections } from "@/services/collections";

/**
 * Demo reset (demo mode / development only): clears the user's interactions, impressions,
 * sessions, predictions, learned memory, evaluations and policy chain, then restores v1.
 * Seeded properties are untouched. This is an explicit operator action — the harness itself
 * never deletes policies.
 */
export async function resetDemoUser(userId: string, options: { keepOnboarding: boolean }): Promise<Record<string, number>> {
  const c = await db();
  const filter = { userId };
  const results = await Promise.all([
    c.interactions.deleteMany(filter),
    c.propertyImpressions.deleteMany(filter),
    c.recommendationSessions.deleteMany(filter),
    c.recommendationPredictions.deleteMany(filter),
    c.preferenceMemories.deleteMany(filter),
    c.preferenceDimensions.deleteMany(filter),
    c.harnessExperiments.deleteMany(filter),
    c.evaluationRuns.deleteMany(filter),
    c.harnessPolicies.deleteMany(filter),
    c.savedProperties.deleteMany(filter),
    c.conversations.deleteMany(filter),
    c.collections.deleteMany({ userId, kind: "custom" }),
    c.savedSearches.deleteMany(filter),
  ]);
  const names = ["interactions", "impressions", "sessions", "predictions", "memories", "dimensions", "experiments", "evaluations", "policies", "saved", "conversations", "customCollections", "savedSearches"];
  const unset: Record<string, ""> = { preferenceState: "", preferenceProfile: "", harnessLockUntil: "" };
  if (!options.keepOnboarding) {
    unset.onboardingCompletedAt = "";
  }
  await c.users.updateOne(
    { _id: userId },
    {
      $unset: unset,
      $set: {
        activePolicyVersion: 1,
        counters: { meaningfulSinceUpdate: 0, realResolvedSinceEvolution: 0 },
        updatedAt: new Date(),
        ...(options.keepOnboarding ? {} : { explicitPreferences: { positive: [], negative: [] }, constraints: { listingType: "sale", minBedrooms: 0, minBathrooms: 0, propertyTypes: [], boroughs: [], neighborhoods: [] } }),
      },
    },
  );
  await ensureInitialPolicy(userId);
  await ensureDefaultCollections(userId);
  invalidateCalibration();
  return Object.fromEntries(names.map((n, i) => [n, results[i].deletedCount]));
}
