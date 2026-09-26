import { z } from "zod";
import { DIMENSION_GROUPS } from "@/lib/features/dimensions";
import { matchDimensions } from "@/lib/features/lexicon";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { BOROUGHS } from "@/models/property";

const Dim = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);

export const CommandActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), query: z.string().min(1).max(300) }),
  z.object({
    kind: z.literal("similar"),
    anchorPropertyId: z.string().optional(),
    cheaper: z.boolean().default(false),
    maxPrice: z.number().int().positive().optional(),
    closerTo: z.enum(BOROUGHS).optional(),
    keep: z.array(Dim).default([]),
    avoidSameNeighborhood: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("explain"), propertyId: z.string().optional() }),
  z.object({
    kind: z.literal("correction"),
    propertyId: z.string().optional(),
    because: z.array(Dim).default([]),
    notBecauseOf: z.array(z.string()).default([]),
    direction: z.enum(["positive", "negative"]),
  }),
  z.object({
    kind: z.literal("preference"),
    corrections: z
      .array(z.object({ dimension: Dim, stance: z.enum(["important", "neutral", "not_important"]), direction: z.enum(["positive", "negative"]) }))
      .min(1)
      .max(8),
  }),
]);
export type CommandAction = z.infer<typeof CommandActionSchema>;

export interface CommandContext {
  propertyId?: string;
}

const GROUP_WORDS: Record<string, string> = {
  kitchen: "kitchen",
  floor: "floors",
  floors: "floors",
  flooring: "floors",
  light: "light",
  lighting: "light",
  style: "style",
  building: "building",
  neighborhood: "location",
  area: "location",
  location: "location",
  block: "location",
  outdoor: "outdoor",
  finishes: "finishes",
};

function groupsIn(text: string): string[] {
  const out = new Set<string>();
  for (const [word, group] of Object.entries(GROUP_WORDS)) if (new RegExp(`\\b${word}\\b`).test(text)) out.add(group);
  return [...out].filter((g) => g in DIMENSION_GROUPS);
}

function dimsIn(text: string): { positive: string[]; negative: string[] } {
  const matches = matchDimensions(text).filter((m) => isAllowedDimension(m.dimension));
  return { positive: matches.filter((m) => !m.negated).map((m) => m.dimension), negative: matches.filter((m) => m.negated).map((m) => m.dimension) };
}

/**
 * Deterministic command parser: natural language → one structured action. The LLM parser
 * produces the same schema; this is its fallback and the default without an API key.
 */
export function parseCommandHeuristic(text: string, context: CommandContext): CommandAction {
  const lower = text.toLowerCase().trim();

  if (/\bwhy\b/.test(lower) && /\b(like|match|recommend|think)\b/.test(lower)) {
    return { kind: "explain", propertyId: context.propertyId };
  }

  // Corrections explain the reason behind a reaction: "not because of the kitchen, it's the carpet".
  const hasReason = /\b(because|due to|reason)\b/.test(lower) || /\bit'?s (?:not )?the\b/.test(lower);
  const notClause = /(?:\bnot\b|n't)[^.;]*?\bthe\s+([a-z\s-]+?)(?=[.,;]|\s+but\b|\s+it'?s\b|\s+i\b|$)/.exec(lower);
  if (context.propertyId && hasReason && notClause) {
    const rest = lower.slice(notClause.index + notClause[0].length);
    const because = matchDimensions(rest).map((m) => m.dimension).filter(isAllowedDimension);
    const negativeReaction = /\b(dislike|hate|don't like|do not like|didn't like|not a fan|can't stand)\b/.test(rest || lower);
    return {
      kind: "correction",
      propertyId: context.propertyId,
      notBecauseOf: [...new Set([...groupsIn(notClause[1]), ...matchDimensions(notClause[1]).map((m) => m.dimension)])],
      because,
      direction: negativeReaction ? "negative" : "positive",
    };
  }

  const refersToThis = /\b(like this|similar|this style|this one|this home|this place|this kitchen|keep (?:this|the))\b/.test(lower);
  if (refersToThis || (context.propertyId && /\b(cheaper|closer to|less expensive|but not)\b/.test(lower))) {
    const closer = /closer to\s+(manhattan|brooklyn|queens|the bronx|bronx|staten island)/.exec(lower);
    const boroughMap: Record<string, (typeof BOROUGHS)[number]> = { manhattan: "Manhattan", brooklyn: "Brooklyn", queens: "Queens", bronx: "Bronx", "the bronx": "Bronx", "staten island": "Staten Island" };
    const keepGroups = groupsIn(lower.split(/\bbut\b/)[0] ?? "");
    return {
      kind: "similar",
      anchorPropertyId: context.propertyId,
      cheaper: /\b(cheaper|less expensive|lower price|more affordable)\b/.test(lower),
      closerTo: closer ? boroughMap[closer[1]] : undefined,
      keep: keepGroups.flatMap((g) => DIMENSION_GROUPS[g] ?? []).filter((k) => !k.startsWith("dated")),
      avoidSameNeighborhood: /\bnot the (neighborhood|area|location|block)\b/.test(lower),
    };
  }

  const prefersPattern = /^(?:i\s+)?(?:really\s+)?(love|like|want|need|prefer|hate|dislike|can't stand|don't want|don't care about|do not care about)\b/;
  const pref = prefersPattern.exec(lower);
  if (pref && !/\b(show|find|search)\b/.test(lower)) {
    const verb = pref[1];
    const { positive, negative } = dimsIn(lower.slice(pref[0].length));
    const all = [...new Set([...positive, ...negative])];
    if (all.length > 0) {
      const notImportant = /care about/.test(verb);
      const negativeVerb = /hate|dislike|can't stand|don't want/.test(verb);
      return {
        kind: "preference",
        corrections: all.slice(0, 8).map((dimension) => ({
          dimension,
          stance: notImportant ? ("not_important" as const) : ("important" as const),
          direction: negativeVerb || negative.includes(dimension) ? ("negative" as const) : ("positive" as const),
        })),
      };
    }
  }

  return { kind: "search", query: text.trim().slice(0, 300) };
}
