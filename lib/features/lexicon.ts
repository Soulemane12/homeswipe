/**
 * Text → dimension lexicon. Used by the heuristic query/command parser, RentCast ingestion
 * (description → features), and preference corrections. Deterministic, no network.
 */
export const DIMENSION_SYNONYMS: Record<string, readonly string[]> = {
  modern_interior: ["modern", "contemporary", "sleek", "updated interior"],
  traditional: ["traditional", "classic", "classical", "old world", "character"],
  minimalist: ["minimalist", "minimal", "clean lines", "scandinavian", "understated"],
  industrial: ["industrial", "loft", "concrete floors", "warehouse"],
  luxury: ["luxury", "luxurious", "high-end", "high end", "upscale", "premium", "designer"],
  natural_light: ["bright", "sunny", "sun-drenched", "sun drenched", "natural light", "light-filled", "light filled", "airy"],
  dark_interior: ["dark", "dim", "gloomy", "moody"],
  large_windows: ["large windows", "big windows", "floor-to-ceiling", "floor to ceiling", "oversized windows", "window walls"],
  hardwood: ["hardwood", "wood floors", "wooden floors", "oak floors", "herringbone"],
  carpet: ["carpet", "carpeted", "carpeting", "wall-to-wall"],
  high_ceilings: ["high ceilings", "tall ceilings", "soaring ceilings", "double-height", "double height"],
  exposed_brick: ["exposed brick", "brick walls"],
  renovated: ["renovated", "gut renovated", "remodeled", "newly updated", "turnkey", "move-in ready", "move in ready"],
  dated_finishes: ["dated", "original condition", "needs work", "fixer", "tlc", "outdated"],
  open_kitchen: ["open kitchen", "open-concept kitchen", "open concept", "kitchen island", "open plan"],
  large_kitchen: ["big kitchen", "large kitchen", "chef's kitchen", "chefs kitchen", "eat-in kitchen", "eat in kitchen", "spacious kitchen"],
  dated_kitchen: ["dated kitchen", "old kitchen", "original kitchen"],
  spacious_layout: ["spacious", "roomy", "sprawling", "generous layout", "large rooms"],
  home_office: ["home office", "office", "study", "work from home", "wfh"],
  balcony: ["balcony", "balconies", "juliet balcony"],
  outdoor_space: ["outdoor space", "garden", "yard", "backyard", "terrace", "patio", "roof deck", "private outdoor"],
  parking: ["parking", "garage", "driveway", "parking spot"],
  doorman: ["doorman", "concierge", "attended lobby"],
  elevator: ["elevator", "lift"],
  gym: ["gym", "fitness center", "fitness room"],
  in_unit_laundry: ["washer", "dryer", "in-unit laundry", "in unit laundry", "w/d"],
  high_rise: ["high-rise", "high rise", "tower", "skyscraper", "high floor", "penthouse"],
  low_rise: ["low-rise", "low rise", "walk-up", "walkup", "brownstone", "townhouse"],
  prewar: ["prewar", "pre-war", "pre war"],
  new_construction: ["new construction", "new development", "brand new", "newly built"],
  near_transit: ["near transit", "near the subway", "subway", "train", "transit", "commute", "near the train"],
  walkability: ["walkable", "walk to", "walking distance"],
  quiet: ["quiet", "peaceful", "tranquil", "tree-lined", "tree lined", "calm"],
  dense_urban: ["urban", "lively", "vibrant", "downtown", "nightlife", "city energy"],
  suburban_feel: ["suburban", "suburb", "detached", "single-family feel"],
  water_views: ["water view", "water views", "river view", "river views", "waterfront", "harbor view", "ocean view"],
};

export interface LexiconMatch {
  dimension: string;
  term: string;
  negated: boolean;
}

const NEGATOR = /\b(no|not|without|never|avoid|hate|dislike|don't want|dont want|don't like|dont like|except|less|anything but)\b/g;
/** Punctuation or contrast words end a negation's scope ("no carpet, but bright"). */
const SCOPE_BREAK = /[,.;!?]|\b(but|with|and want|plus)\b/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds dimension mentions in free text, marking negated ones ("no carpet", "don't like dark").
 * Longer phrases win over shorter overlapping ones (e.g. "dated kitchen" over "dated"). A
 * negator only applies to the next attribute mentioned, within a short window and scope.
 */
export function matchDimensions(text: string): LexiconMatch[] {
  const lower = ` ${text.toLowerCase()} `;
  const candidates: { dimension: string; term: string; index: number; length: number }[] = [];
  for (const [dimension, terms] of Object.entries(DIMENSION_SYNONYMS)) {
    for (const term of terms) {
      const re = new RegExp(`(?<![a-z])${escapeRegex(term)}(?![a-z])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower)) !== null) {
        candidates.push({ dimension, term, index: m.index, length: term.length });
      }
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  const accepted: typeof candidates = [];
  for (const c of candidates) {
    const end = c.index + c.length;
    if (accepted.some((a) => c.index < a.index + a.length && end > a.index)) continue;
    accepted.push(c);
  }
  accepted.sort((a, b) => a.index - b.index);

  const negators: number[] = [];
  let n: RegExpExecArray | null;
  NEGATOR.lastIndex = 0;
  while ((n = NEGATOR.exec(lower)) !== null) negators.push(n.index + n[0].length);

  const matches = new Map<string, LexiconMatch>();
  accepted.forEach((c, i) => {
    const negatorEnd = [...negators].reverse().find((pos) => pos <= c.index && c.index - pos <= 30);
    let negated = false;
    if (negatorEnd !== undefined) {
      const between = lower.slice(negatorEnd, c.index);
      const earlierTermInScope = accepted.slice(0, i).some((a) => a.index >= negatorEnd);
      negated = !SCOPE_BREAK.test(between) && !earlierTermInScope;
    }
    const existing = matches.get(c.dimension);
    if (!existing || (negated && !existing.negated)) matches.set(c.dimension, { dimension: c.dimension, term: c.term, negated });
  });
  return [...matches.values()];
}

/** Extracts a feature map from listing text for providers without structured attributes. */
export function featuresFromText(text: string): Record<string, number> {
  const features: Record<string, number> = {};
  for (const match of matchDimensions(text)) {
    features[match.dimension] = match.negated ? 0.1 : 0.8;
  }
  return features;
}
