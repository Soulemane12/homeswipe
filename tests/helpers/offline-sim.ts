import seed from "@/data/seed-properties.json";
import { HARNESS_CONFIG, LEARNING_CONFIG } from "@/lib/config/harness";
import { DECISIVE_OUTCOME } from "@/lib/config/signals";
import { toEngineProperty } from "@/lib/engine/adapters";
import { computeCatalogStats } from "@/lib/engine/catalog";
import { satisfiesHardConstraints } from "@/lib/engine/constraints";
import { evolvePolicy, type EvolutionResult } from "@/lib/engine/evolution";
import { INITIAL_POLICY, type HarnessPolicy } from "@/lib/engine/policy-schema";
import { buildPreferenceState } from "@/lib/engine/preference-state";
import { rankCandidates } from "@/lib/engine/rank";
import { batchCutoff, type ReplayDataset, type ReplayExample } from "@/lib/engine/replay";
import type { EngineInteraction, EngineProperty, Label } from "@/lib/engine/types";
import { simulateDecision, type HiddenProfile } from "@/lib/simulation/hidden-profiles";
import { createRng, hashString } from "@/lib/utils/prng";
import { PropertySchema } from "@/models/property";
import type { HardConstraints } from "@/models/user";

export function loadSeedEngineProperties(): EngineProperty[] {
  return (seed as unknown[]).map((raw) => toEngineProperty(PropertySchema.parse(raw)));
}

export interface OfflineExample extends ReplayExample {
  predicted: Label;
  score: number;
}

export interface OfflineRun {
  examples: OfflineExample[];
  evolutions: EvolutionResult[];
  finalPolicy: HarnessPolicy;
  finalVersion: number;
}

/**
 * Drives the real engine end-to-end without a database: rank → predict → hidden user acts →
 * batched memory → evolve every N resolved predictions. Mirrors the live pipeline's logic.
 */
export function runOfflineSimulation(input: {
  profile: HiddenProfile;
  steps: number;
  constraints: HardConstraints;
  seed?: number;
  batchSize?: number;
}): OfflineRun {
  const properties = loadSeedEngineProperties();
  const byId = new Map(properties.map((p) => [p.id, p]));
  const stats = computeCatalogStats(properties);
  const rng = createRng(input.seed ?? 7);
  const batchSize = input.batchSize ?? 5;
  let policy = INITIAL_POLICY;
  let version = 1;
  let resolvedSinceEvolution = 0;
  const interactions: EngineInteraction[] = [];
  const examples: OfflineExample[] = [];
  const evolutions: EvolutionResult[] = [];
  const seen = new Set<string>();
  let clock = new Date("2026-09-01T12:00:00Z").getTime();
  let step = 0;
  let batch = 0;

  while (step < input.steps) {
    const cutoff = batchCutoff(interactions, interactions.length, LEARNING_CONFIG.preferenceUpdateEvery);
    const state = buildPreferenceState({
      interactions: interactions.slice(0, cutoff),
      properties: byId,
      stats,
      memoryPolicy: policy.memoryPolicy,
      explicit: input.profile.onboarding,
      space: "local",
    });
    const candidates = properties.filter((p) => !seen.has(p.id) && satisfiesHardConstraints(p, input.constraints));
    if (candidates.length === 0) break;
    const batchId = `batch-${batch++}`;
    const shownAt = new Date((clock += 1000));
    const ranked = rankCandidates({
      candidates,
      ctx: { state, policy, stats, constraints: input.constraints, properties: byId, now: shownAt },
      limit: batchSize,
      seed: `${batchId}:${hashString(String(input.seed ?? 7))}`,
    });
    for (const item of ranked.items) {
      if (step >= input.steps) break;
      const property = byId.get(item.scored.propertyId)!;
      seen.add(property.id);
      const decision = simulateDecision(input.profile, property, stats, step, rng);
      const createdAt = new Date((clock += 5000));
      const interaction: EngineInteraction = {
        id: `i-${step}`,
        propertyId: property.id,
        type: decision.type,
        createdAt,
        dwellMs: decision.dwellMs,
        simulated: true,
      };
      interactions.push(interaction);
      const actual = DECISIVE_OUTCOME[decision.type]!;
      examples.push({
        id: `e-${step}`,
        propertyId: property.id,
        batchId,
        shownAt,
        resolvedAt: createdAt,
        actual,
        exploration: item.exploration,
        outcomeType: decision.type,
        dwellMs: decision.dwellMs,
        simulated: true,
        policyVersion: version,
        predicted: item.predictedLabel,
        score: item.predictedLikeScore,
      });
      step++;
      resolvedSinceEvolution++;
    }

    if (examples.length >= HARNESS_CONFIG.minResolvedForEvolution && resolvedSinceEvolution >= HARNESS_CONFIG.autoEvolveEvery) {
      resolvedSinceEvolution = 0;
      const dataset: ReplayDataset = {
        examples,
        interactions,
        properties: byId,
        stats,
        explicit: input.profile.onboarding,
        constraints: input.constraints,
        space: "local",
        batchEvery: LEARNING_CONFIG.preferenceUpdateEvery,
      };
      const result = evolvePolicy({
        dataset,
        currentPolicy: policy,
        config: { ...HARNESS_CONFIG },
        context: {
          saveCount: interactions.filter((i) => i.type === "save").length,
          positiveInteractionCount: interactions.filter((i) => i.type !== "dislike").length,
        },
      });
      evolutions.push(result);
      if (result.status === "promoted" && result.selected) {
        policy = result.selected.policy;
        version++;
      }
    }
  }
  return { examples, evolutions, finalPolicy: policy, finalVersion: version };
}

export function accuracyByVersion(examples: OfflineExample[]): Record<number, { n: number; accuracy: number }> {
  const out: Record<number, { n: number; correct: number; accuracy: number }> = {};
  for (const e of examples) {
    const bucket = (out[e.policyVersion] ??= { n: 0, correct: 0, accuracy: 0 });
    bucket.n++;
    if (e.predicted === e.actual) bucket.correct++;
  }
  for (const b of Object.values(out)) b.accuracy = b.correct / b.n;
  return out;
}
