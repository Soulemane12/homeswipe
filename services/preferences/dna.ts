import "server-only";
import { effectiveConfidence, effectiveStrength } from "@/lib/engine/preference-state";
import { selectExplorationTargets } from "@/lib/engine/exploration";
import { dimensionLabel, getDimension } from "@/lib/features/dimensions";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { db } from "@/lib/mongodb/collections";
import type { HardConstraints } from "@/models/user";
import { getPersonalContext } from "@/services/recommendations/personalize";

export interface DnaTrait {
  dimension: string;
  label: string;
  strength: number;
  confidence: number;
  strengthLabel: "Very strong" | "Strong" | "Moderate" | "Emerging";
  source: "inferred" | "onboarding" | "correction";
  stance?: "important" | "neutral" | "not_important";
  evidence: { positive: number; negative: number; homes: { id: string; headline: string; image?: string }[] };
  category: string;
}

export interface HomeDna {
  summary: string;
  positives: DnaTrait[];
  negatives: DnaTrait[];
  learning: { dimension: string; label: string; confidence: number }[];
  dismissed: DnaTrait[];
  recentShifts: { dimension: string; label: string; direction: "up" | "down" }[];
  learnings: string[];
  constraints: HardConstraints;
  interactionCount: number;
  includesSimulated: boolean;
  updatedAt?: Date;
}

function strengthLabel(v: number): DnaTrait["strengthLabel"] {
  const a = Math.abs(v);
  if (a >= 0.55) return "Very strong";
  if (a >= 0.35) return "Strong";
  if (a >= 0.18) return "Moderate";
  return "Emerging";
}

/** Consumer-facing view of preference memory: what SwipeHome believes, how sure it is, and why. */
export async function getHomeDna(userId: string): Promise<HomeDna> {
  const ctx = await getPersonalContext(userId);
  const c = await db();
  const [memories, history] = await Promise.all([
    c.preferenceMemories.find({ userId, status: "active", type: "experiment_learning" }).sort({ updatedAt: -1 }).limit(6).toArray(),
    c.interactions.find({ userId }, { projection: { _id: 1, propertyId: 1 } }).toArray(),
  ]);
  const propertyOf = new Map(history.map((h) => [h._id.toHexString(), h.propertyId]));
  const homesFor = (ids: string[]) =>
    [...new Set(ids.map((id) => propertyOf.get(id)).filter((p): p is string => Boolean(p)))]
      .slice(-4)
      .reverse()
      .map((id) => ctx.catalog.propertyById.get(id))
      .filter((p) => p !== undefined)
      .map((p) => ({ id: p.id, headline: p.headline, image: p.media[0]?.url }));

  const traits: DnaTrait[] = Object.values(ctx.state.dimensions)
    .filter((d) => isAllowedDimension(d.key))
    .map((d) => {
      const strength = effectiveStrength(d, ctx.policy.memoryPolicy);
      return {
        dimension: d.key,
        label: dimensionLabel(d.key),
        strength,
        confidence: effectiveConfidence(d),
        strengthLabel: strengthLabel(strength),
        source: d.explicit?.source === "correction" ? ("correction" as const) : d.explicit ? ("onboarding" as const) : ("inferred" as const),
        stance: d.explicit?.stance,
        evidence: {
          positive: d.positiveEvidence.length,
          negative: d.negativeEvidence.length,
          homes: homesFor(strength >= 0 ? d.positiveEvidence : d.negativeEvidence),
        },
        category: getDimension(d.key)?.category ?? "other",
      };
    });

  const visible = (t: DnaTrait) => t.source !== "inferred" || (t.confidence >= 0.35 && Math.abs(t.strength) >= 0.15);
  const rank = (t: DnaTrait) => Math.abs(t.strength) * (0.5 + t.confidence / 2);
  const dismissed = traits.filter((t) => t.stance === "not_important");
  const positives = traits.filter((t) => t.strength > 0 && t.stance !== "not_important" && visible(t)).sort((a, b) => rank(b) - rank(a)).slice(0, 10);
  const negatives = traits.filter((t) => t.strength < 0 && t.stance !== "not_important" && visible(t)).sort((a, b) => rank(b) - rank(a)).slice(0, 8);
  const learning = selectExplorationTargets(ctx.state, ctx.catalog.stats, ctx.policy, 4).map((t) => ({ dimension: t.dimension, label: dimensionLabel(t.dimension), confidence: t.confidence }));
  const recentShifts = Object.values(ctx.state.dimensions)
    .filter((d) => !d.explicit && d.evidenceCount >= 3 && Math.abs(d.recent - d.longTerm) >= 0.2 && isAllowedDimension(d.key))
    .sort((a, b) => Math.abs(b.recent - b.longTerm) - Math.abs(a.recent - a.longTerm))
    .slice(0, 3)
    .map((d) => ({ dimension: d.key, label: dimensionLabel(d.key), direction: d.recent > d.longTerm ? ("up" as const) : ("down" as const) }));

  return {
    summary: ctx.user.preferenceProfile?.summary ?? "Swipe through a few homes and SwipeHome will start describing your taste here.",
    positives,
    negatives,
    learning,
    dismissed,
    recentShifts,
    learnings: memories.map((m) => m.statement),
    constraints: ctx.user.constraints,
    interactionCount: ctx.state.interactionCount,
    includesSimulated: ctx.state.simulatedCount > 0,
    updatedAt: ctx.user.preferenceState?.computedAt,
  };
}
