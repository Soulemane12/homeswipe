import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import { dimensionNoun } from "@/lib/features/dimensions";
import type { MemoryDraft } from "@/services/memory/generate";

function joinNouns(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface PreferenceSummary {
  text: string;
  /** Changes only when the strongest remembered dimensions change meaningfully. */
  signature: string;
  memoryKeys: string[];
}

/**
 * Builds the natural-language preference representation from typed memories, selected by the
 * policy's memory and context rules (how many positives/negatives, whether recent shifts and
 * uncertain dimensions are included). This text is what gets embedded for semantic retrieval,
 * so the harness changing memory/context policy genuinely changes retrieval.
 */
export function buildPreferenceSummary(memories: MemoryDraft[], policy: HarnessPolicy): PreferenceSummary {
  const { memoryPolicy, contextPolicy } = policy;
  const rank = (m: MemoryDraft) => Math.abs(m.strength) * m.confidence;
  const positives = memories
    .filter((m) => m.type === "inferred_positive" || (contextPolicy.includeExplicitPreferences && m.type === "explicit_positive"))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, memoryPolicy.maxPositiveMemories);
  const negatives = contextPolicy.includeNegativeMemories
    ? memories
        .filter((m) => m.type === "inferred_negative" || (contextPolicy.includeExplicitPreferences && m.type === "explicit_negative"))
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, memoryPolicy.maxNegativeMemories)
    : [];
  const recent = contextPolicy.includeRecentMemories ? memories.filter((m) => m.type === "recent" && m.strength > 0).slice(0, 3) : [];
  const uncertain = contextPolicy.includeUncertaintyMemories ? memories.filter((m) => m.type === "uncertainty").slice(0, 2) : [];

  const parts: string[] = [];
  if (positives.length > 0) parts.push(`Prefers homes with ${joinNouns(positives.map((m) => dimensionNoun(m.key)))}.`);
  if (negatives.length > 0) parts.push(`Avoids ${joinNouns(negatives.map((m) => dimensionNoun(m.key)))}.`);
  if (recent.length > 0) parts.push(`Lately more interested in ${joinNouns(recent.map((m) => dimensionNoun(m.key)))}.`);
  if (uncertain.length > 0) parts.push(`Open to ${joinNouns(uncertain.map((m) => dimensionNoun(m.key)))}.`);
  const text = parts.join(" ") || "Still getting to know this home seeker.";

  const bucket = (v: number) => (v >= 0.5 ? "++" : v >= 0.15 ? "+" : v <= -0.5 ? "--" : v <= -0.15 ? "-" : "0");
  const signature = [...positives, ...negatives, ...recent]
    .map((m) => `${m.key}${bucket(m.strength)}`)
    .sort()
    .join("|");
  return { text, signature, memoryKeys: [...positives, ...negatives, ...recent, ...uncertain].map((m) => `${m.type}:${m.key}`) };
}
