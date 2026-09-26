import "server-only";
import type { Collection } from "mongodb";
import type { EvaluationRunDoc, HarnessExperimentDoc, HarnessPolicyDoc } from "@/models/harness";
import type { InteractionDoc } from "@/models/interaction";
import type { CollectionDoc, ConversationDoc, SavedPropertyDoc, SavedSearchDoc } from "@/models/library";
import type { PreferenceDimensionDoc, PreferenceMemoryDoc } from "@/models/memory";
import type { PropertyDoc } from "@/models/property";
import type { PropertyImpressionDoc, RecommendationPredictionDoc, RecommendationSessionDoc } from "@/models/recommendation";
import type { UserDoc } from "@/models/user";
import { getDb } from "./client";

export const COLLECTION_NAMES = {
  users: "users",
  properties: "properties",
  interactions: "interactions",
  propertyImpressions: "property_impressions",
  savedProperties: "saved_properties",
  collections: "collections",
  preferenceMemories: "preference_memories",
  preferenceDimensions: "preference_dimensions",
  recommendationSessions: "recommendation_sessions",
  recommendationPredictions: "recommendation_predictions",
  harnessPolicies: "harness_policies",
  harnessExperiments: "harness_experiments",
  evaluationRuns: "evaluation_runs",
  savedSearches: "saved_searches",
  conversations: "conversations",
} as const;

export interface Collections {
  users: Collection<UserDoc>;
  properties: Collection<PropertyDoc>;
  interactions: Collection<InteractionDoc>;
  propertyImpressions: Collection<PropertyImpressionDoc>;
  savedProperties: Collection<SavedPropertyDoc>;
  collections: Collection<CollectionDoc>;
  preferenceMemories: Collection<PreferenceMemoryDoc>;
  preferenceDimensions: Collection<PreferenceDimensionDoc>;
  recommendationSessions: Collection<RecommendationSessionDoc>;
  recommendationPredictions: Collection<RecommendationPredictionDoc>;
  harnessPolicies: Collection<HarnessPolicyDoc>;
  harnessExperiments: Collection<HarnessExperimentDoc>;
  evaluationRuns: Collection<EvaluationRunDoc>;
  savedSearches: Collection<SavedSearchDoc>;
  conversations: Collection<ConversationDoc>;
}

/** Typed access to every SwipeHome collection. */
export async function db(): Promise<Collections> {
  const database = await getDb();
  const c = COLLECTION_NAMES;
  return {
    users: database.collection<UserDoc>(c.users),
    properties: database.collection<PropertyDoc>(c.properties),
    interactions: database.collection<InteractionDoc>(c.interactions),
    propertyImpressions: database.collection<PropertyImpressionDoc>(c.propertyImpressions),
    savedProperties: database.collection<SavedPropertyDoc>(c.savedProperties),
    collections: database.collection<CollectionDoc>(c.collections),
    preferenceMemories: database.collection<PreferenceMemoryDoc>(c.preferenceMemories),
    preferenceDimensions: database.collection<PreferenceDimensionDoc>(c.preferenceDimensions),
    recommendationSessions: database.collection<RecommendationSessionDoc>(c.recommendationSessions),
    recommendationPredictions: database.collection<RecommendationPredictionDoc>(c.recommendationPredictions),
    harnessPolicies: database.collection<HarnessPolicyDoc>(c.harnessPolicies),
    harnessExperiments: database.collection<HarnessExperimentDoc>(c.harnessExperiments),
    evaluationRuns: database.collection<EvaluationRunDoc>(c.evaluationRuns),
    savedSearches: database.collection<SavedSearchDoc>(c.savedSearches),
    conversations: database.collection<ConversationDoc>(c.conversations),
  };
}
