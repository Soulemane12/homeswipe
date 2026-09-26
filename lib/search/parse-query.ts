import { z } from "zod";
import { matchDimensions } from "@/lib/features/lexicon";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { NEIGHBORHOODS } from "@/lib/seed/neighborhoods";
import { BOROUGHS, PROPERTY_TYPES, type Borough, type PropertyType } from "@/models/property";

export const ParsedQuerySchema = z.object({
  constraints: z.object({
    minPrice: z.number().int().positive().optional(),
    maxPrice: z.number().int().positive().optional(),
    minBedrooms: z.number().int().min(0).max(10).optional(),
    minBathrooms: z.number().min(0).max(10).optional(),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).optional(),
    boroughs: z.array(z.enum(BOROUGHS)).optional(),
    neighborhoods: z.array(z.string()).optional(),
  }),
  desired: z.array(z.string()),
  avoided: z.array(z.string()),
  semanticText: z.string(),
});
export type ParsedQuery = z.infer<typeof ParsedQuerySchema>;

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  lic: "Long Island City",
  uws: "Upper West Side",
  ues: "Upper East Side",
  fidi: "Financial District",
  "bed-stuy": "Bedford-Stuyvesant",
  "bed stuy": "Bedford-Stuyvesant",
  "bk heights": "Brooklyn Heights",
  "hells kitchen": "Hell's Kitchen",
  plg: "Prospect Lefferts Gardens",
};
const TYPE_PATTERNS: [RegExp, PropertyType][] = [
  [/\bcondos?\b/, "condo"],
  [/\bco-?ops?\b/, "co-op"],
  [/\b(townhouses?|townhomes?|brownstones?|row ?houses?)\b/, "townhouse"],
  [/\b(single[- ]family|detached (?:house|home)s?|houses?)\b/, "single_family"],
  [/\b(multi[- ]family|two[- ]family|duplex)\b/, "multi_family"],
];

function parseAmount(num: string, unit?: string): number {
  const n = Number.parseFloat(num.replace(/,/g, ""));
  const u = unit?.toLowerCase();
  if (u === "m" || u === "mm" || u === "million") return Math.round(n * 1_000_000);
  if (u === "k" || u === "thousand") return Math.round(n * 1_000);
  return n < 100 ? Math.round(n * 1_000_000) : Math.round(n);
}

/**
 * Deterministic natural-language search parsing. Hard constraints (price, beds, baths, type,
 * place) are separated from soft desires (attributes to rank by). Used directly when no LLM is
 * configured, and as the fallback when the LLM output fails validation.
 */
export function parseSearchQueryHeuristic(text: string): ParsedQuery {
  const lower = text.toLowerCase();
  const constraints: ParsedQuery["constraints"] = {};
  const amount = String.raw`\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?`;

  const between = new RegExp(`between\\s+${amount}\\s+(?:and|-|to)\\s+${amount}`).exec(lower);
  if (between) {
    constraints.minPrice = parseAmount(between[1], between[2]);
    constraints.maxPrice = parseAmount(between[3], between[4]);
  } else {
    const max = new RegExp(`(?:under|below|less than|max(?:imum)?|up to|no more than|<)\\s*${amount}`).exec(lower);
    if (max) constraints.maxPrice = parseAmount(max[1], max[2]);
    const min = new RegExp(`(?:over|above|more than|at least|min(?:imum)?|>)\\s*${amount}`).exec(lower);
    if (min && !/\b(bed|bath)/.test(lower.slice(min.index, min.index + 25))) constraints.minPrice = parseAmount(min[1], min[2]);
  }

  const beds = /(\d+|one|two|three|four|five|six)\s*\+?\s*(?:-\s*)?(?:bed(?:room)?s?|br|bd)\b/.exec(lower);
  if (beds) constraints.minBedrooms = NUMBER_WORDS[beds[1]] ?? Number.parseInt(beds[1], 10);
  const baths = /(\d+(?:\.5)?|one|two|three)\s*\+?\s*(?:-\s*)?(?:bath(?:room)?s?|ba)\b/.exec(lower);
  if (baths) constraints.minBathrooms = NUMBER_WORDS[baths[1]] ?? Number.parseFloat(baths[1]);

  const types = TYPE_PATTERNS.filter(([re]) => re.test(lower)).map(([, t]) => t);
  if (types.length > 0) constraints.propertyTypes = [...new Set(types)];

  const boroughs = BOROUGHS.filter((b) => lower.includes(b.toLowerCase()) && !new RegExp(`(closer to|near|not in)\\s+${b.toLowerCase()}`).test(lower));
  if (boroughs.length > 0) constraints.boroughs = boroughs as Borough[];

  const hoods = new Set<string>();
  for (const n of NEIGHBORHOODS) if (lower.includes(n.name.toLowerCase())) hoods.add(n.name);
  for (const [alias, name] of Object.entries(NEIGHBORHOOD_ALIASES)) if (new RegExp(`\\b${alias}\\b`).test(lower)) hoods.add(name);
  if (hoods.size > 0) constraints.neighborhoods = [...hoods];

  const matches = matchDimensions(text).filter((m) => isAllowedDimension(m.dimension));
  return {
    constraints,
    desired: matches.filter((m) => !m.negated).map((m) => m.dimension),
    avoided: matches.filter((m) => m.negated).map((m) => m.dimension),
    semanticText: text.trim(),
  };
}
