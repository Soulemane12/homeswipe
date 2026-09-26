import "server-only";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { z } from "zod";
import { llmAvailable, generateStructured } from "@/lib/ai/llm";
import { embedUserPreference } from "@/lib/embeddings/provider";
import { selectExplorationTargets } from "@/lib/engine/exploration";
import { buildPreferenceState, effectiveConfidence, effectiveStrength, preferenceWeights } from "@/lib/engine/preference-state";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import type { EngineInteraction, PreferenceState } from "@/lib/engine/types";
import { checkPreferenceText } from "@/lib/guardrails/fair-housing";
import { db } from "@/lib/mongodb/collections";
import type { PreferenceDimensionDoc, PreferenceMemoryDoc } from "@/models/memory";
import type { UserDoc } from "@/models/user";
import { getActivePolicy } from "@/services/harness/policies";
import { generateMemories, type ProbeSummary } from "@/services/memory/generate";
import { loadCatalog, type Catalog } from "@/services/properties/repository";
import { getOrCreateUser } from "@/services/users";
import { loadInteractionHistory } from "./history";
import { buildPreferenceSummary } from "./summary";

export interface PreferenceUpdateResult {
  summary: string;
  summaryChanged: boolean;
  embeddingRegenerated: boolean;
  dimensionsUpdated: number;
  memoriesActive: number;
}

function computeState(user: UserDoc, policy: HarnessPolicy, catalog: Catalog, history: EngineInteraction[]): PreferenceState {
  return buildPreferenceState({
    interactions: history,
    properties: catalog.byId,
    stats: catalog.stats,
    memoryPolicy: policy.memoryPolicy,
    explicit: user.explicitPreferences,
    space: catalog.space,
    explicitEmbedding: catalog.space !== "local" && user.preferenceProfile?.embeddingModel === catalog.space ? user.preferenceProfile.embedding : undefined,
  });
}

/**
 * The recommender's working memory. Recomputed only by the batched update (or immediately
 * after an explicit correction / policy change); feeds read the persisted snapshot.
 */
export async function getLiveState(user: UserDoc, policy: { version: number; policy: HarnessPolicy }, catalog: Catalog): Promise<PreferenceState> {
  const stored = user.preferenceState;
  if (stored && stored.policyVersion === policy.version) return stored.state;
  await updatePreferences(user._id);
  const c = await db();
  const fresh = await c.users.findOne({ _id: user._id }, { projection: { preferenceState: 1 } });
  return fresh?.preferenceState?.state ?? computeState(user, policy.policy, catalog, []);
}

async function probeSummaries(userId: string): Promise<ProbeSummary[]> {
  const c = await db();
  const rows = await c.harnessExperiments
    .aggregate<{ _id: string; shown: number; liked: number }>([
      { $match: { userId, kind: "exploration_probe", outcome: { $exists: true } } },
      { $group: { _id: "$targetDimension", shown: { $sum: 1 }, liked: { $sum: { $cond: [{ $eq: ["$outcome", "LIKE"] }, 1, 0] } } } },
    ])
    .toArray();
  return rows.filter((r) => r._id).map((r) => ({ dimension: r._id, shown: r.shown, liked: r.liked }));
}

const PolishSchema = z.object({ summary: z.string().min(10).max(400) });

async function polishSummary(template: string, statements: string[]): Promise<string> {
  if (!llmAvailable() || statements.length === 0) return template;
  const out = await generateStructured({
    name: "preference_summary",
    schema: PolishSchema,
    system:
      "You rewrite a home seeker's remembered preferences into one or two natural sentences for a semantic search query. Use only the facts given. Describe property attributes only — never people, demographics, schools, religion, family status or neighborhood composition.",
    prompt: `Facts:\n${statements.map((s) => `- ${s}`).join("\n")}\n\nTemplate summary: ${template}`,
  });
  if (!out || !checkPreferenceText(out.summary).allowed) return template;
  return out.summary;
}

/**
 * Batched preference update: recompute learned state → persist dimensions and typed memories
 * (archiving, never deleting) → rebuild the preference summary → re-embed only if the
 * summary's signature changed → measure exploration probes.
 */
export async function updatePreferences(userId: string): Promise<PreferenceUpdateResult> {
  const c = await db();
  const [user, active, catalog, history] = await Promise.all([getOrCreateUser(userId), getActivePolicy(userId), loadCatalog(), loadInteractionHistory(userId)]);
  const policy = active.policy;
  const state = computeState(user, policy, catalog, history);
  const now = new Date();
  const includesSimulated = state.simulatedCount > 0;

  // 1. Dimensions.
  const dimOps: AnyBulkWriteOperation<PreferenceDimensionDoc>[] = Object.values(state.dimensions).map((dim) => {
    const strength = effectiveStrength(dim, policy.memoryPolicy);
    return {
      updateOne: {
        filter: { userId, dimension: dim.key },
        update: {
          $set: {
            direction: strength > 0.05 ? "positive" : strength < -0.05 ? "negative" : "neutral",
            strength,
            longTermStrength: dim.longTerm,
            recentStrength: dim.recent,
            confidence: effectiveConfidence(dim),
            evidenceCount: dim.evidenceCount,
            source: dim.explicit?.source === "correction" ? "correction" : dim.explicit ? "onboarding" : "inferred",
            stance: dim.explicit?.stance,
            positiveEvidence: dim.positiveEvidence,
            negativeEvidence: dim.negativeEvidence,
            lastEvidenceAt: dim.lastEvidenceAt,
            updatedAt: now,
          },
          $setOnInsert: { _id: new ObjectId(), userId, dimension: dim.key },
        },
        upsert: true,
      },
    };
  });
  if (dimOps.length > 0) await c.preferenceDimensions.bulkWrite(dimOps, { ordered: false });

  // 2. Typed memories.
  const interactionToProperty = new Map(history.map((h) => [h.id, h.propertyId]));
  const drafts = generateMemories({
    state,
    policy,
    stats: catalog.stats,
    constraints: user.constraints,
    explicit: user.explicitPreferences,
    interactions: history,
    properties: catalog.byId,
    probes: await probeSummaries(userId),
    evidencePropertyIds: (ids) => [...new Set(ids.map((id) => interactionToProperty.get(id)).filter((p): p is string => Boolean(p)))].slice(-8),
  });
  const memOps: AnyBulkWriteOperation<PreferenceMemoryDoc>[] = drafts.map((d) => ({
    updateOne: {
      filter: { userId, type: d.type, key: d.key },
      update: {
        $set: { ...d, status: "active", includesSimulated, updatedAt: now },
        $setOnInsert: { _id: new ObjectId(), userId, createdAt: now },
      },
      upsert: true,
    },
  }));
  if (memOps.length > 0) await c.preferenceMemories.bulkWrite(memOps, { ordered: false });
  const activeKeys = drafts.map((d) => `${d.type}:${d.key}`);
  const stale = await c.preferenceMemories.find({ userId, status: "active", type: { $ne: "experiment_learning" } }, { projection: { type: 1, key: 1 } }).toArray();
  const staleIds = stale.filter((m) => !activeKeys.includes(`${m.type}:${m.key}`)).map((m) => m._id);
  if (staleIds.length > 0) await c.preferenceMemories.updateMany({ _id: { $in: staleIds } }, { $set: { status: "archived", updatedAt: now } });

  // 3. Preference representation (text + embedding) — regenerated only on meaningful change.
  const summary = buildPreferenceSummary(drafts, policy);
  const previous = user.preferenceProfile;
  const summaryChanged = !previous || previous.signature !== summary.signature;
  let embedding = previous?.embedding;
  let embeddingModel = previous?.embeddingModel;
  let text = previous?.summary ?? summary.text;
  if (summaryChanged) {
    const relevant = drafts.filter((d) => summary.memoryKeys.includes(`${d.type}:${d.key}`)).map((d) => d.statement);
    text = await polishSummary(summary.text, relevant);
    const embedded = await embedUserPreference(text);
    if (embedded.space === "embedding") {
      embedding = embedded.vector;
      embeddingModel = embedded.model;
    }
  }
  const weights = preferenceWeights(state, policy);
  await c.users.updateOne(
    { _id: userId },
    {
      $set: {
        preferenceState: { state, policyVersion: active.version, interactionCount: history.length, computedAt: now },
        preferenceProfile: {
          summary: text,
          signature: summary.signature,
          embedding,
          embeddingModel,
          localVector: weights,
          includesSimulated,
          updatedAt: summaryChanged ? now : (previous?.updatedAt ?? now),
        },
        "counters.meaningfulSinceUpdate": 0,
        updatedAt: now,
      },
    },
  );

  // 4. Exploration probes: record how much each probe moved confidence.
  const pending = await c.harnessExperiments.find({ userId, kind: "exploration_probe", status: "resolved" }).toArray();
  for (const probe of pending) {
    const dim = probe.targetDimension ? state.dimensions[probe.targetDimension] : undefined;
    if (!dim) continue;
    await c.harnessExperiments.updateOne({ _id: probe._id }, { $set: { confidenceAfter: effectiveConfidence(dim), status: "measured", updatedAt: now } });
  }

  return {
    summary: text,
    summaryChanged,
    embeddingRegenerated: summaryChanged && embedding !== previous?.embedding,
    dimensionsUpdated: dimOps.length,
    memoriesActive: drafts.length,
  };
}

/** Current exploration targets for display (Home DNA "still learning", lab "exploration target"). */
export function currentExplorationTargets(state: PreferenceState, policy: HarnessPolicy, catalog: Catalog) {
  return selectExplorationTargets(state, catalog.stats, policy, 3);
}
