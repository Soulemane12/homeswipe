import "server-only";
import { z } from "zod";
import { generateStructured, llmAvailable } from "@/lib/ai/llm";
import { effectiveConfidence, effectiveStrength } from "@/lib/engine/preference-state";
import { dimensionLabel } from "@/lib/features/dimensions";
import { checkPreferenceText } from "@/lib/guardrails/fair-housing";
import { formatCompactPrice } from "@/lib/utils/format";
import type { PropertyCardData } from "@/models/card";
import { savedPropertyIds } from "@/services/collections";
import { toCard } from "@/services/properties/cards";
import { getPersonalContext } from "@/services/recommendations/personalize";

export interface CompareProperty extends PropertyCardData {
  details: { taxesAnnual?: number; estimatedMonthly?: number; yearBuilt?: number; pricePerSqft?: number; features: string[] };
}

export interface CompareResult {
  properties: CompareProperty[];
  priorities: { dimension: string; label: string; direction: "positive" | "negative"; weight: number }[];
  matrix: { dimension: string; label: string; direction: "positive" | "negative"; values: { id: string; value: number }[]; winnerId?: string }[];
  summary: string;
  bestMatchId?: string;
}

const SummarySchema = z.object({ summary: z.string().min(20).max(500) });

/** Side-by-side comparison, plus "compare based on what I care about" from learned priorities. */
export async function compareProperties(userId: string, ids: string[], options: { polish?: boolean } = {}): Promise<CompareResult> {
  const ctx = await getPersonalContext(userId);
  const saved = await savedPropertyIds(userId);
  const found = ids.map((id) => ctx.catalog.propertyById.get(id)).filter((p) => p !== undefined).slice(0, 4);

  const properties: CompareProperty[] = found.map((p) => {
    const scored = ctx.scorer.score(ctx.catalog.byId.get(p.id)!);
    return {
      ...toCard(p, { scored, saved: saved.has(p.id) }),
      details: {
        taxesAnnual: p.financial.taxesAnnual,
        estimatedMonthly: p.financial.estimatedMonthly,
        yearBuilt: p.facts.yearBuilt,
        pricePerSqft: p.facts.sqft ? Math.round(p.financial.price / p.facts.sqft) : undefined,
        features: p.features,
      },
    };
  });

  const priorities = Object.values(ctx.state.dimensions)
    .map((d) => ({ d, s: effectiveStrength(d, ctx.policy.memoryPolicy), c: effectiveConfidence(d) }))
    .filter(({ s, c }) => Math.abs(s) >= 0.12 && c >= 0.3)
    .sort((a, b) => Math.abs(b.s) * b.c - Math.abs(a.s) * a.c)
    .slice(0, 6)
    .map(({ d, s, c }) => ({ dimension: d.key, label: dimensionLabel(d.key), direction: s >= 0 ? ("positive" as const) : ("negative" as const), weight: Math.abs(s) * c }));

  const matrix = priorities.map((pr) => {
    const values = found.map((p) => ({ id: p.id, value: p.ai.features[pr.dimension] ?? 0 }));
    const sorted = [...values].sort((a, b) => (pr.direction === "positive" ? b.value - a.value : a.value - b.value));
    const winnerId = sorted.length > 1 && Math.abs(sorted[0].value - sorted[1].value) >= 0.15 ? sorted[0].id : undefined;
    return { dimension: pr.dimension, label: pr.label, direction: pr.direction, values, winnerId };
  });

  const wins = new Map<string, number>();
  for (const row of matrix) if (row.winnerId) wins.set(row.winnerId, (wins.get(row.winnerId) ?? 0) + priorities.find((p) => p.dimension === row.dimension)!.weight);
  const bestByFit = [...properties].sort((a, b) => (b.match?.percent ?? 0) - (a.match?.percent ?? 0))[0];
  const bestMatchId = [...wins.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? bestByFit?.id;

  const name = (id: string) => {
    const p = properties.find((x) => x.id === id);
    return p ? `the ${p.neighborhood} ${p.bedrooms === 0 ? "studio" : `${p.bedrooms}BR`}` : "";
  };
  let summary = "Save a few homes and swipe a little more — HomeSwipe needs a clearer picture of your priorities to compare them for you.";
  if (properties.length >= 2 && bestMatchId) {
    const bestWins = matrix.filter((r) => r.winnerId === bestMatchId).map((r) => (r.direction === "negative" ? `avoiding ${r.label.toLowerCase()}` : r.label.toLowerCase()));
    const cheapest = [...properties].sort((a, b) => a.price - b.price)[0];
    const best = properties.find((p) => p.id === bestMatchId)!;
    const priorityText = priorities
      .slice(0, 3)
      .map((p) => (p.direction === "negative" ? `no ${p.label.toLowerCase()}` : p.label.toLowerCase()))
      .join(", ");
    summary = `Based on what you care about${priorities.length ? ` (${priorityText})` : ""}, ${name(bestMatchId)} is the stronger fit${bestWins.length ? ` — it leads on ${bestWins.slice(0, 3).join(", ")}` : ""}.`;
    if (cheapest.id !== bestMatchId) summary += ` ${capitalize(name(cheapest.id))} costs ${formatCompactPrice(best.price - cheapest.price)} less.`;
  }

  if (options.polish && llmAvailable() && properties.length >= 2) {
    const out = await generateStructured({
      name: "compare_summary",
      schema: SummarySchema,
      system: "Rewrite this home comparison into 2 friendly sentences. Use only the facts given; mention property attributes and prices only.",
      prompt: JSON.stringify({ draft: summary, matrix, properties: properties.map((p) => ({ id: p.id, name: name(p.id), price: p.price, match: p.match?.percent })) }),
    });
    if (out && checkPreferenceText(out.summary).allowed) summary = out.summary;
  }

  return { properties, priorities, matrix, summary, bestMatchId };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
