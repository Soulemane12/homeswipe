import { z } from "zod";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { RANKING_COMPONENTS, type RankingComponent } from "./types";

/**
 * The harness policy: the only thing the self-improvement loop may change. It is plain,
 * bounded JSON — never code. Hard constraints (budget, bedrooms, geography) are deliberately
 * absent, so no policy can override them.
 */
export const CANDIDATE_GENERATORS = ["semantic", "similarLiked", "savedAnchor", "exploration", "fresh", "geo"] as const;
export type CandidateGenerator = (typeof CANDIDATE_GENERATORS)[number];

export const EXPLORATION_STRATEGIES = ["uncertainty", "epsilon", "diversity", "none"] as const;
export type ExplorationStrategy = (typeof EXPLORATION_STRATEGIES)[number];

const GeneratorSchema = z.object({
  enabled: z.boolean(),
  limit: z.number().int().min(0).max(100),
});

const weightShape = Object.fromEntries(RANKING_COMPONENTS.map((c) => [c, z.number().min(0).max(1)])) as Record<
  RankingComponent,
  z.ZodNumber
>;

export const HarnessPolicySchema = z.object({
  candidateGenerators: z.object({
    semantic: GeneratorSchema,
    similarLiked: GeneratorSchema,
    savedAnchor: GeneratorSchema,
    exploration: GeneratorSchema,
    fresh: GeneratorSchema,
    geo: GeneratorSchema,
  }),
  rankingWeights: z
    .object(weightShape)
    .refine((w) => Object.values(w).reduce((s, v) => s + v, 0) > 0.01, "ranking weights must not all be zero"),
  memoryPolicy: z
    .object({
      recentInteractionWindow: z.number().int().min(5).max(200),
      maxPositiveMemories: z.number().int().min(1).max(20),
      maxNegativeMemories: z.number().int().min(1).max(20),
      recentMemoryWeight: z.number().min(0).max(3),
      longTermMemoryWeight: z.number().min(0).max(3),
      negativeMemoryWeight: z.number().min(0.3).max(3),
    })
    .refine((m) => m.recentMemoryWeight + m.longTermMemoryWeight > 0.05, "memory weights must not both be zero"),
  explorationPolicy: z.object({
    rate: z.number().min(0).max(0.35),
    strategy: z.enum(EXPLORATION_STRATEGIES),
    minConfidenceTarget: z.number().min(0.1).max(0.9),
  }),
  contextPolicy: z.object({
    includeExplicitPreferences: z.boolean(),
    includeRecentMemories: z.boolean(),
    includeNegativeMemories: z.boolean(),
    includeUncertaintyMemories: z.boolean(),
  }),
  featureImportance: z
    .record(z.string(), z.number().min(0.25).max(3))
    .refine((r) => Object.keys(r).every(isAllowedDimension), "feature importance contains a blocked dimension"),
  prediction: z.object({
    threshold: z.number().min(0.2).max(0.8),
    sharpness: z.number().min(2).max(30),
  }),
});

export type HarnessPolicy = z.infer<typeof HarnessPolicySchema>;

export function normalizeWeights(weights: Record<RankingComponent, number>): Record<RankingComponent, number> {
  const sum = RANKING_COMPONENTS.reduce((s, c) => s + Math.max(0, weights[c]), 0);
  const out = {} as Record<RankingComponent, number>;
  for (const c of RANKING_COMPONENTS) out[c] = sum > 0 ? Math.round((Math.max(0, weights[c]) / sum) * 1000) / 1000 : 0;
  return out;
}

/** Validates and normalizes a policy. Throws a ZodError with readable issues when invalid. */
export function parsePolicy(input: unknown): HarnessPolicy {
  const parsed = HarnessPolicySchema.parse(input);
  return { ...parsed, rankingWeights: normalizeWeights(parsed.rankingWeights) };
}

export function safeParsePolicy(input: unknown): { ok: true; policy: HarnessPolicy } | { ok: false; errors: string[] } {
  const result = HarnessPolicySchema.safeParse(input);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, policy: { ...result.data, rankingWeights: normalizeWeights(result.data.rankingWeights) } };
}

/**
 * Seeded v1 policy — reasonable but intentionally imperfect: it over-trusts listing metadata
 * (price/bedroom "sweet spot") and explicit onboarding answers, under-weights learned and
 * semantic signals, treats negative evidence softly, barely distinguishes recent behavior,
 * and explores very little. Real interaction history has to justify every change from here.
 */
export const INITIAL_POLICY: HarnessPolicy = {
  candidateGenerators: {
    semantic: { enabled: true, limit: 40 },
    similarLiked: { enabled: false, limit: 20 },
    savedAnchor: { enabled: false, limit: 15 },
    exploration: { enabled: true, limit: 15 },
    fresh: { enabled: true, limit: 10 },
    geo: { enabled: false, limit: 10 },
  },
  rankingWeights: normalizeWeights({
    semantic: 0.15,
    explicit: 0.25,
    inferred: 0.1,
    visual: 0.08,
    behavior: 0.05,
    metadata: 0.3,
    freshness: 0.05,
    exploration: 0.02,
  }),
  memoryPolicy: {
    recentInteractionWindow: 50,
    maxPositiveMemories: 6,
    maxNegativeMemories: 4,
    recentMemoryWeight: 0.5,
    longTermMemoryWeight: 1.0,
    negativeMemoryWeight: 0.8,
  },
  explorationPolicy: {
    rate: 0.05,
    strategy: "epsilon",
    minConfidenceTarget: 0.45,
  },
  contextPolicy: {
    includeExplicitPreferences: true,
    includeRecentMemories: false,
    includeNegativeMemories: true,
    includeUncertaintyMemories: false,
  },
  featureImportance: {},
  prediction: {
    threshold: 0.5,
    sharpness: 10,
  },
};
