import { RAPID_DISLIKE_MS } from "@/lib/config/signals";
import { selectExplorationTargets } from "@/lib/engine/exploration";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import { effectiveConfidence, effectiveStrength } from "@/lib/engine/preference-state";
import type { CatalogStats, EngineInteraction, EngineProperty, PreferenceState } from "@/lib/engine/types";
import { dimensionLabel, dimensionNoun } from "@/lib/features/dimensions";
import { checkPreferenceText, isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { formatCompactPrice } from "@/lib/utils/format";
import type { MemoryType } from "@/models/memory";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import type { ExplicitPreferences, HardConstraints } from "@/models/user";

export interface MemoryDraft {
  type: MemoryType;
  key: string;
  statement: string;
  strength: number;
  confidence: number;
  evidenceCount: number;
  supportingPropertyIds: string[];
}

export interface ProbeSummary {
  dimension: string;
  shown: number;
  liked: number;
}

function positiveStatement(strength: number, noun: string): string {
  if (strength >= 0.5) return `Strongly prefers ${noun}.`;
  if (strength >= 0.3) return `Consistently prefers ${noun}.`;
  return `Tends to prefer ${noun}.`;
}

/**
 * Derives typed memories from the learned state. Deterministic templates — the LLM is never
 * needed to produce memory, and every statement passes the fair-housing guardrail.
 */
export function generateMemories(input: {
  state: PreferenceState;
  policy: HarnessPolicy;
  stats: CatalogStats;
  constraints: HardConstraints;
  explicit: ExplicitPreferences;
  interactions: EngineInteraction[];
  properties: Map<string, EngineProperty>;
  probes: ProbeSummary[];
  evidencePropertyIds: (interactionIds: string[]) => string[];
}): MemoryDraft[] {
  const { state, policy, constraints } = input;
  const drafts: MemoryDraft[] = [];

  // Hard constraints (never changed by the harness).
  const hc = (key: string, statement: string) => drafts.push({ type: "hard_constraint", key, statement, strength: 1, confidence: 1, evidenceCount: 0, supportingPropertyIds: [] });
  if (constraints.maxPrice) hc("max_price", `Budget up to ${formatCompactPrice(constraints.maxPrice)} — a hard limit.`);
  if (constraints.minPrice) hc("min_price", `Minimum price ${formatCompactPrice(constraints.minPrice)}.`);
  if (constraints.minBedrooms > 0) hc("min_bedrooms", `At least ${constraints.minBedrooms} bedroom${constraints.minBedrooms > 1 ? "s" : ""}.`);
  if (constraints.minBathrooms > 0) hc("min_bathrooms", `At least ${constraints.minBathrooms} bathroom${constraints.minBathrooms > 1 ? "s" : ""}.`);
  if (constraints.propertyTypes.length > 0) hc("property_types", `Only ${constraints.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t].toLowerCase()).join(", ")} listings.`);
  if (constraints.boroughs.length > 0) hc("boroughs", `Searching in ${constraints.boroughs.join(", ")}.`);

  for (const dim of Object.values(state.dimensions)) {
    if (!isAllowedDimension(dim.key)) continue;
    const strength = effectiveStrength(dim, policy.memoryPolicy);
    const confidence = effectiveConfidence(dim);
    const noun = dimensionNoun(dim.key);
    const support = input.evidencePropertyIds(strength >= 0 ? dim.positiveEvidence : dim.negativeEvidence);

    if (dim.explicit) {
      const positive = dim.explicit.value > 0 || (dim.explicit.value === 0 && strength >= 0);
      const statement =
        dim.explicit.source === "correction"
          ? dim.explicit.stance === "not_important"
            ? `You said ${noun} doesn't matter to you.`
            : dim.explicit.stance === "neutral"
              ? `You said ${noun} is nice but not essential.`
              : positive
                ? `You told SwipeHome ${noun} is important.`
                : `You told SwipeHome to avoid ${noun}.`
          : positive
            ? `You asked for ${noun}.`
            : `You asked to avoid ${noun}.`;
      drafts.push({ type: positive ? "explicit_positive" : "explicit_negative", key: dim.key, statement, strength, confidence, evidenceCount: dim.evidenceCount, supportingPropertyIds: support });
      continue;
    }

    if (strength >= 0.15 && confidence >= 0.35) {
      drafts.push({ type: "inferred_positive", key: dim.key, statement: positiveStatement(strength, noun), strength, confidence, evidenceCount: dim.evidenceCount, supportingPropertyIds: support });
    } else if (strength <= -0.15 && confidence >= 0.35) {
      drafts.push({ type: "inferred_negative", key: dim.key, statement: Math.abs(strength) >= 0.4 ? `Strongly dislikes ${noun}.` : `Tends to pass on ${noun}.`, strength, confidence, evidenceCount: dim.evidenceCount, supportingPropertyIds: support });
    }

    const shift = dim.recent - dim.longTerm;
    if (Math.abs(shift) >= 0.2 && dim.evidenceCount >= 3) {
      drafts.push({ type: "recent", key: dim.key, statement: shift > 0 ? `Recently warming to ${noun}.` : `Recently cooling on ${noun}.`, strength: shift, confidence, evidenceCount: dim.evidenceCount, supportingPropertyIds: support });
    }
  }

  for (const target of selectExplorationTargets(state, input.stats, policy, 3)) {
    drafts.push({ type: "uncertainty", key: target.dimension, statement: `Still learning how you feel about ${dimensionNoun(target.dimension)}.`, strength: 0, confidence: target.confidence, evidenceCount: state.dimensions[target.dimension]?.evidenceCount ?? 0, supportingPropertyIds: [] });
  }

  // Behavioral pattern: instant rejections concentrated on one attribute.
  const rapid = input.interactions.filter((i) => i.type === "dislike" && typeof i.dwellMs === "number" && i.dwellMs < RAPID_DISLIKE_MS && i.propertyId);
  if (rapid.length >= 3) {
    const counts = new Map<string, number>();
    for (const r of rapid) {
      const p = input.properties.get(r.propertyId!);
      if (!p) continue;
      for (const [k, v] of Object.entries(p.features)) if (v >= 0.65 && isAllowedDimension(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    // Only a clearly negative, non-explicit dimension counts as a rejection pattern — never one
    // the user explicitly asked for.
    const [top] = [...counts.entries()]
      .filter(([k]) => (state.dimensions[k]?.longTerm ?? 0) <= -0.15 && !((state.dimensions[k]?.explicit?.value ?? 0) > 0))
      .sort((a, b) => b[1] - a[1]);
    if (top && top[1] >= 3) {
      drafts.push({ type: "behavioral", key: `rapid_reject_${top[0]}`, statement: `Rejects homes with ${dimensionNoun(top[0])} within seconds (${top[1]} times).`, strength: -0.5, confidence: Math.min(1, top[1] / 6), evidenceCount: top[1], supportingPropertyIds: [] });
    }
  }
  const superLikes = input.interactions.filter((i) => i.type === "super_like").length;
  if (superLikes >= 2) {
    drafts.push({ type: "behavioral", key: "super_likes", statement: `Super-liked ${superLikes} homes — those carry the most weight in your profile.`, strength: 0.5, confidence: 1, evidenceCount: superLikes, supportingPropertyIds: [] });
  }

  for (const probe of input.probes) {
    if (probe.shown < 2 || !isAllowedDimension(probe.dimension)) continue;
    drafts.push({
      type: "experiment_learning",
      key: `probe_${probe.dimension}`,
      statement: `Tested ${dimensionLabel(probe.dimension).toLowerCase()} on ${probe.shown} homes: you liked ${probe.liked}.`,
      strength: probe.liked / probe.shown - 0.5,
      confidence: Math.min(1, probe.shown / 6),
      evidenceCount: probe.shown,
      supportingPropertyIds: [],
    });
  }

  return drafts.filter((d) => checkPreferenceText(d.statement).allowed);
}
