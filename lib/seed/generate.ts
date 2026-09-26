import { DIMENSIONS, FEATURE_SPACE_VERSION, getDimension, toFeatureVector } from "@/lib/features/dimensions";
import { clamp } from "@/lib/utils/math";
import { createRng, gaussian, pick } from "@/lib/utils/prng";
import { PROPERTY_TYPE_LABEL, type Property, type PropertyMedia, type PropertyType } from "@/models/property";
import { IMAGE_POOLS, unsplashUrl, type ImagePool } from "./image-library";
import { NEIGHBORHOODS, type NeighborhoodProfile } from "./neighborhoods";

/**
 * Deterministic generator for the seeded NYC dataset. Listings are synthetic (clearly marked
 * `source.provider = "seed"`), built from eight archetypes with per-listing noise and
 * deliberate counter-examples so the preference learner has real signal to find.
 */
export const SEED_REFERENCE_DATE = new Date("2026-09-20T12:00:00Z");
const SEED = 20260925;

type Rng = () => number;
const BINARY_DIMS = new Set(["balcony", "outdoor_space", "parking", "doorman", "elevator", "gym", "in_unit_laundry", "exposed_brick", "home_office"]);

interface Archetype {
  key: string;
  count: number;
  neighborhoods: string[];
  propertyTypes: PropertyType[];
  bedrooms: number[];
  sqftPerBed: [number, number];
  yearBuilt: [number, number];
  floors: [number, number];
  ppsfMultiplier: number;
  features: Record<string, number>;
  /** Std-dev of feature noise; wider means more within-archetype variety. */
  noise: number;
  images: {
    hero: ImagePool[];
    heroDark: ImagePool[];
    kitchen: ImagePool;
    kitchenRenovated: ImagePool;
    exterior?: ImagePool;
  };
  headlineNoun: (type: PropertyType) => string;
}

const ARCHETYPES: Archetype[] = [
  {
    key: "glass_tower",
    count: 22,
    neighborhoods: ["Long Island City", "Financial District", "Hell's Kitchen", "Chelsea", "Battery Park City", "DUMBO", "Williamsburg"],
    propertyTypes: ["condo"],
    bedrooms: [0, 1, 1, 2, 2, 2, 3],
    sqftPerBed: [620, 820],
    yearBuilt: [2008, 2025],
    floors: [20, 60],
    ppsfMultiplier: 1.1,
    noise: 0.12,
    features: { modern_interior: 0.85, traditional: 0.1, minimalist: 0.45, industrial: 0.08, luxury: 0.7, natural_light: 0.8, large_windows: 0.88, hardwood: 0.6, carpet: 0.08, high_ceilings: 0.5, renovated: 0.88, open_kitchen: 0.85, large_kitchen: 0.4, spacious_layout: 0.55, balcony: 0.55, outdoor_space: 0.2, parking: 0.3, doorman: 0.9, elevator: 1, gym: 0.85, in_unit_laundry: 0.85, exposed_brick: 0, home_office: 0.3 },
    images: { hero: ["interiorBrightModern", "interiorLuxury"], heroDark: ["interiorDark"], kitchen: "kitchenModern", kitchenRenovated: "kitchenModern", exterior: "exteriorHighRise" },
    headlineNoun: () => "condo in a glass tower",
  },
  {
    key: "prewar_classic",
    count: 22,
    neighborhoods: ["Upper West Side", "Upper East Side", "Washington Heights", "Harlem", "Brooklyn Heights", "Forest Hills", "Riverdale", "Park Slope"],
    propertyTypes: ["co-op", "co-op", "co-op", "condo"],
    bedrooms: [1, 1, 2, 2, 3],
    sqftPerBed: [580, 780],
    yearBuilt: [1905, 1940],
    floors: [6, 16],
    ppsfMultiplier: 0.9,
    noise: 0.18,
    features: { modern_interior: 0.25, traditional: 0.8, minimalist: 0.12, industrial: 0.05, luxury: 0.35, natural_light: 0.55, large_windows: 0.45, hardwood: 0.82, carpet: 0.1, high_ceilings: 0.7, renovated: 0.45, open_kitchen: 0.25, large_kitchen: 0.35, spacious_layout: 0.6, balcony: 0.05, outdoor_space: 0.08, parking: 0.05, doorman: 0.55, elevator: 0.9, gym: 0.15, in_unit_laundry: 0.2, exposed_brick: 0.05, home_office: 0.4 },
    images: { hero: ["interiorTraditional"], heroDark: ["interiorDark"], kitchen: "kitchenClassic", kitchenRenovated: "kitchenModern", exterior: "exteriorMidRise" },
    headlineNoun: (t) => (t === "co-op" ? "pre-war co-op" : "pre-war condo"),
  },
  {
    key: "brownstone",
    count: 16,
    neighborhoods: ["Park Slope", "Bedford-Stuyvesant", "Harlem", "Brooklyn Heights", "Crown Heights", "Prospect Lefferts Gardens", "Greenpoint"],
    propertyTypes: ["townhouse", "townhouse", "townhouse", "condo", "condo"],
    bedrooms: [2, 3, 3, 4, 5],
    sqftPerBed: [520, 720],
    yearBuilt: [1880, 1915],
    floors: [3, 4],
    ppsfMultiplier: 1.0,
    noise: 0.15,
    features: { modern_interior: 0.35, traditional: 0.75, minimalist: 0.12, industrial: 0.05, luxury: 0.45, natural_light: 0.6, large_windows: 0.5, hardwood: 0.9, carpet: 0.05, high_ceilings: 0.75, renovated: 0.55, open_kitchen: 0.45, large_kitchen: 0.6, spacious_layout: 0.7, balcony: 0.1, outdoor_space: 0.8, parking: 0.1, doorman: 0, elevator: 0.02, gym: 0, in_unit_laundry: 0.6, exposed_brick: 0.45, home_office: 0.55 },
    images: { hero: ["interiorTraditional", "interiorLuxury"], heroDark: ["interiorDark", "interiorTraditional"], kitchen: "kitchenClassic", kitchenRenovated: "kitchenModern", exterior: "exteriorTownhouseModern" },
    headlineNoun: (t) => (t === "townhouse" ? "brownstone" : "brownstone floor-through"),
  },
  {
    key: "industrial_loft",
    count: 16,
    neighborhoods: ["Tribeca", "DUMBO", "Williamsburg", "Bushwick", "Greenpoint", "Chelsea", "Mott Haven"],
    propertyTypes: ["condo", "condo", "co-op"],
    bedrooms: [1, 1, 2, 2, 3],
    sqftPerBed: [780, 1080],
    yearBuilt: [1900, 1930],
    floors: [5, 12],
    ppsfMultiplier: 1.0,
    noise: 0.14,
    features: { modern_interior: 0.55, traditional: 0.2, minimalist: 0.35, industrial: 0.9, luxury: 0.45, natural_light: 0.7, large_windows: 0.85, hardwood: 0.55, carpet: 0.02, high_ceilings: 0.92, renovated: 0.65, open_kitchen: 0.85, large_kitchen: 0.55, spacious_layout: 0.8, balcony: 0.1, outdoor_space: 0.2, parking: 0.1, doorman: 0.3, elevator: 0.6, gym: 0.2, in_unit_laundry: 0.7, exposed_brick: 0.85, home_office: 0.5 },
    images: { hero: ["interiorIndustrial"], heroDark: ["interiorIndustrial"], kitchen: "kitchenModern", kitchenRenovated: "kitchenModern" },
    headlineNoun: () => "loft",
  },
  {
    key: "renovated_walkup",
    count: 18,
    neighborhoods: ["East Village", "Astoria", "Greenpoint", "Crown Heights", "Bushwick", "Sunnyside", "Harlem", "Williamsburg"],
    propertyTypes: ["condo", "co-op"],
    bedrooms: [0, 1, 1, 2, 2],
    sqftPerBed: [470, 640],
    yearBuilt: [1910, 1960],
    floors: [3, 5],
    ppsfMultiplier: 0.95,
    noise: 0.14,
    features: { modern_interior: 0.75, traditional: 0.2, minimalist: 0.5, industrial: 0.15, luxury: 0.3, natural_light: 0.65, large_windows: 0.4, hardwood: 0.75, carpet: 0.05, high_ceilings: 0.35, renovated: 0.9, open_kitchen: 0.75, large_kitchen: 0.25, spacious_layout: 0.3, balcony: 0.15, outdoor_space: 0.3, parking: 0.02, doorman: 0, elevator: 0.05, gym: 0.02, in_unit_laundry: 0.45, exposed_brick: 0.3, home_office: 0.25 },
    images: { hero: ["interiorBrightModern", "interiorMinimalist"], heroDark: ["interiorDark"], kitchen: "kitchenModern", kitchenRenovated: "kitchenModern", exterior: "exteriorMidRise" },
    headlineNoun: () => "walk-up",
  },
  {
    key: "dated_value",
    count: 18,
    neighborhoods: ["Bay Ridge", "Forest Hills", "Riverdale", "Washington Heights", "Sunnyside", "Mott Haven", "Prospect Lefferts Gardens", "St. George"],
    propertyTypes: ["co-op", "co-op", "condo"],
    bedrooms: [1, 1, 2, 2, 3],
    sqftPerBed: [640, 840],
    yearBuilt: [1950, 1975],
    floors: [6, 20],
    ppsfMultiplier: 0.72,
    noise: 0.16,
    features: { modern_interior: 0.15, traditional: 0.5, minimalist: 0.1, industrial: 0.02, luxury: 0.08, natural_light: 0.35, large_windows: 0.35, hardwood: 0.35, carpet: 0.6, high_ceilings: 0.15, renovated: 0.15, open_kitchen: 0.15, large_kitchen: 0.35, spacious_layout: 0.55, balcony: 0.35, outdoor_space: 0.1, parking: 0.45, doorman: 0.35, elevator: 0.85, gym: 0.1, in_unit_laundry: 0.1, exposed_brick: 0.05, home_office: 0.2 },
    images: { hero: ["interiorTraditional"], heroDark: ["interiorDark"], kitchen: "kitchenClassic", kitchenRenovated: "kitchenModern", exterior: "exteriorMidRise" },
    headlineNoun: (t) => (t === "co-op" ? "co-op" : "condo"),
  },
  {
    key: "minimalist_boutique",
    count: 14,
    neighborhoods: ["Williamsburg", "Chelsea", "Greenpoint", "East Village", "Park Slope", "Long Island City", "Crown Heights"],
    propertyTypes: ["condo"],
    bedrooms: [0, 1, 1, 2, 2],
    sqftPerBed: [540, 740],
    yearBuilt: [2014, 2025],
    floors: [5, 10],
    ppsfMultiplier: 1.05,
    noise: 0.12,
    features: { modern_interior: 0.85, traditional: 0.05, minimalist: 0.9, industrial: 0.2, luxury: 0.5, natural_light: 0.8, large_windows: 0.75, hardwood: 0.7, carpet: 0.02, high_ceilings: 0.5, renovated: 0.9, open_kitchen: 0.9, large_kitchen: 0.35, spacious_layout: 0.45, balcony: 0.7, outdoor_space: 0.35, parking: 0.1, doorman: 0.2, elevator: 0.9, gym: 0.35, in_unit_laundry: 0.95, exposed_brick: 0.05, home_office: 0.35 },
    images: { hero: ["interiorMinimalist", "interiorBrightModern"], heroDark: ["interiorMinimalist"], kitchen: "kitchenModern", kitchenRenovated: "kitchenModern", exterior: "exteriorTownhouseModern" },
    headlineNoun: () => "boutique condo",
  },
  {
    key: "suburban_house",
    count: 24,
    neighborhoods: ["Todt Hill", "Tottenville", "St. George", "Riverdale", "Bay Ridge", "Forest Hills"],
    propertyTypes: ["single_family", "single_family", "single_family", "single_family", "multi_family", "townhouse"],
    bedrooms: [3, 3, 4, 4, 5],
    sqftPerBed: [480, 680],
    yearBuilt: [1925, 2018],
    floors: [2, 3],
    ppsfMultiplier: 1.0,
    noise: 0.22,
    features: { modern_interior: 0.35, traditional: 0.65, minimalist: 0.15, industrial: 0.02, luxury: 0.35, natural_light: 0.6, large_windows: 0.45, hardwood: 0.6, carpet: 0.35, high_ceilings: 0.35, renovated: 0.5, open_kitchen: 0.5, large_kitchen: 0.7, spacious_layout: 0.85, balcony: 0.2, outdoor_space: 0.95, parking: 0.92, doorman: 0, elevator: 0, gym: 0.05, in_unit_laundry: 0.9, exposed_brick: 0.1, home_office: 0.6 },
    images: { hero: ["interiorTraditional"], heroDark: ["interiorDark"], kitchen: "kitchenClassic", kitchenRenovated: "kitchenModern", exterior: "exteriorHouseTraditional" },
    headlineNoun: (t) => (t === "multi_family" ? "two-family house" : t === "townhouse" ? "attached townhouse" : "detached house"),
  },
];

const SENTENCE_NOUN: Record<PropertyType, string> = {
  condo: "condo",
  "co-op": "co-op",
  townhouse: "townhouse",
  single_family: "single-family house",
  multi_family: "two-family house",
};

const BED_WORD = ["Studio", "One-bedroom", "Two-bedroom", "Three-bedroom", "Four-bedroom", "Five-bedroom"];

function between(rng: Rng, [lo, hi]: [number, number]): number {
  return lo + rng() * (hi - lo);
}

function sampleFeatures(rng: Rng, arch: Archetype, hood: NeighborhoodProfile, yearBuilt: number, floors: number): Record<string, number> {
  const f: Record<string, number> = {};
  for (const [key, mean] of Object.entries(arch.features)) {
    f[key] = BINARY_DIMS.has(key)
      ? rng() < mean
        ? 0.85 + 0.15 * rng()
        : 0.1 * rng()
      : clamp(mean + gaussian(rng) * arch.noise);
  }

  // Counter-examples: ~18% of listings break their archetype on one visual aspect.
  if (rng() < 0.18) {
    const twist = Math.floor(rng() * 5);
    if (twist === 0) f.natural_light = clamp(f.natural_light + 0.4);
    if (twist === 1) f.natural_light = clamp(f.natural_light - 0.4);
    if (twist === 2) {
      f.carpet = 0.8;
      f.hardwood = 0.15;
    }
    if (twist === 3) {
      f.renovated = 0.92;
      f.modern_interior = clamp(f.modern_interior + 0.35);
    }
    if (twist === 4) {
      f.open_kitchen = 0.12;
      f.renovated = clamp(f.renovated - 0.4);
    }
  }

  f.traditional = clamp(0.5 * f.traditional + 0.5 * (1 - f.modern_interior) + gaussian(rng) * 0.05);
  f.dark_interior = clamp(0.95 - f.natural_light + gaussian(rng) * 0.08);
  f.dated_finishes = clamp(0.95 - f.renovated + gaussian(rng) * 0.08);
  f.dated_kitchen = clamp(f.dated_finishes - 0.1 * f.open_kitchen + gaussian(rng) * 0.08);
  if (f.carpet > 0.5) f.hardwood = Math.min(f.hardwood, clamp(1.05 - f.carpet));

  f.high_rise = floors >= 15 ? clamp(0.9 + rng() * 0.1) : floors >= 10 ? 0.45 + rng() * 0.1 : rng() * 0.08;
  f.low_rise = floors <= 5 ? clamp(0.88 + rng() * 0.12) : floors <= 8 ? 0.35 + rng() * 0.1 : rng() * 0.08;
  f.prewar = yearBuilt < 1945 ? clamp(0.85 + rng() * 0.15) : rng() * 0.06;
  f.new_construction = yearBuilt >= 2015 ? clamp(0.88 + rng() * 0.12) : yearBuilt >= 2005 ? 0.4 : rng() * 0.06;
  if (floors >= 7 && f.elevator < 0.5) f.elevator = 0.95;

  for (const [key, base] of Object.entries(hood.location)) {
    f[key] = key === "water_views" ? (rng() < base ? 0.85 + 0.15 * rng() : 0.08 * rng()) : clamp(base + gaussian(rng) * 0.08);
  }
  for (const d of DIMENSIONS) f[d.key] = Math.round(clamp(f[d.key] ?? 0) * 100) / 100;
  return f;
}

function bathroomsFor(rng: Rng, beds: number, type: PropertyType): number {
  let baths = beds <= 1 ? 1 : beds === 2 ? (rng() < 0.6 ? 2 : 1) : beds === 3 ? (rng() < 0.5 ? 2 : 2.5) : rng() < 0.5 ? 3 : 3.5;
  if ((type === "single_family" || type === "townhouse") && beds >= 3) baths += 0.5;
  return baths;
}

function priceFor(rng: Rng, sqft: number, hood: NeighborhoodProfile, arch: Archetype, type: PropertyType, f: Record<string, number>): number {
  const typeMult = type === "co-op" ? 0.85 : type === "townhouse" ? 1.12 : type === "multi_family" ? 1.05 : 1;
  const quality = 1 + 0.35 * (f.luxury - 0.4) + 0.15 * (f.renovated - 0.5) + 0.12 * f.water_views + 0.05 * (f.natural_light - 0.5) + 0.06 * f.doorman;
  const raw = sqft * hood.ppsf * arch.ppsfMultiplier * typeMult * quality * (1 + gaussian(rng) * 0.07);
  const step = raw > 2_000_000 ? 25_000 : 5_000;
  return Math.max(250_000, Math.round(raw / step) * step);
}

function monthlyPayment(price: number, hoa: number, taxesAnnual: number): number {
  const principal = price * 0.8;
  const r = 0.065 / 12;
  const n = 360;
  const mortgage = (principal * r) / (1 - (1 + r) ** -n);
  return Math.round(mortgage + hoa + taxesAnnual / 12);
}

function high(f: Record<string, number>, key: string, t = 0.6): boolean {
  return (f[key] ?? 0) >= t;
}

function buildDescription(rng: Rng, input: { beds: number; type: PropertyType; hood: NeighborhoodProfile; arch: Archetype; f: Record<string, number>; floor: number; floors: number }): { headline: string; description: string } {
  const { beds, type, hood, arch, f } = input;
  const bedWord = BED_WORD[Math.min(beds, BED_WORD.length - 1)];
  const bedShort = beds === 0 ? "Studio" : `${beds}BR`;
  const lead = high(f, "natural_light", 0.75)
    ? pick(rng, ["Sun-filled", "Light-drenched", "Bright"])
    : high(f, "renovated", 0.8)
      ? pick(rng, ["Renovated", "Turnkey", "Updated"])
      : high(f, "traditional", 0.7)
        ? pick(rng, ["Classic", "Gracious", "Character-rich"])
        : high(f, "industrial", 0.7)
          ? pick(rng, ["Raw-edged", "Soaring", "Double-height"])
          : f.dated_finishes > 0.6
            ? pick(rng, ["Value-priced", "Well-kept", "Original-condition"])
            : pick(rng, ["Comfortable", "Well-proportioned", "Easygoing"]);
  const withFeature = high(f, "outdoor_space", 0.8)
    ? type === "single_family" || type === "multi_family" ? " with yard" : " with private outdoor space"
    : high(f, "balcony", 0.8)
      ? " with balcony"
      : high(f, "water_views", 0.8)
        ? " with water views"
        : high(f, "exposed_brick", 0.8)
          ? " with exposed brick"
          : "";
  const headline = `${lead} ${bedShort} ${arch.headlineNoun(type)}${withFeature}`;

  const sentences: string[] = [];
  const floorPhrase = input.floors >= 15 ? `on the ${ordinal(input.floor)} floor` : input.floors <= 4 ? "in a low-rise building" : "in a mid-rise building";
  sentences.push(`${bedWord} ${SENTENCE_NOUN[type]} ${type === "single_family" || type === "multi_family" ? "on a residential street" : floorPhrase} in ${hood.name}.`);

  if (high(f, "natural_light", 0.75)) {
    sentences.push(pick(rng, [
      "Oversized windows pull in light from morning to evening.",
      "Light pours in through generous windows on two exposures.",
      "Sun-drenched rooms look out over open sky.",
    ]));
  } else if (f.natural_light >= 0.45) {
    sentences.push("Rooms get good natural light for most of the day.");
  } else {
    sentences.push(pick(rng, [
      "Rooms are cozy and on the darker side, with filtered light.",
      "The apartment faces the interior courtyard, so light is soft and indirect.",
    ]));
  }

  const floors = high(f, "carpet", 0.5)
    ? "wall-to-wall carpeting in the living areas"
    : high(f, "hardwood", 0.6)
      ? high(f, "prewar") ? "original herringbone oak floors" : "wide-plank hardwood floors"
      : "tile and laminate floors";
  if (high(f, "industrial", 0.7)) {
    sentences.push(`Exposed brick, timber beams and ceilings over eleven feet give it true loft character, with ${floors}.`);
  } else if (high(f, "minimalist", 0.7)) {
    sentences.push(`A pared-back palette of white oak and matte finishes keeps it calm and uncluttered, with ${floors}.`);
  } else if (high(f, "modern_interior", 0.65)) {
    sentences.push(`Interiors are sleek and contemporary, with ${floors}.`);
  } else if (high(f, "traditional", 0.6)) {
    sentences.push(`${pick(rng, ["Crown moldings", "Arched doorways", "A decorative fireplace"])} and other classic details sit alongside ${floors}.`);
  } else {
    sentences.push(`Finishes are simple and practical, with ${floors}.`);
  }

  if (high(f, "dated_kitchen", 0.6)) sentences.push("The kitchen is original and ready for your renovation ideas.");
  else if (high(f, "open_kitchen", 0.65)) sentences.push(high(f, "large_kitchen", 0.6) ? "A large open kitchen with an island anchors the living space." : "The open kitchen has quartz counters and integrated appliances.");
  else if (high(f, "large_kitchen", 0.6)) sentences.push("The generous windowed kitchen has room for a dining table.");
  else sentences.push("A separate galley kitchen keeps cooking out of the living space.");

  if (high(f, "renovated", 0.8)) sentences.push("Recently renovated top to bottom.");
  else if (high(f, "dated_finishes", 0.65)) sentences.push("Original finishes throughout, priced accordingly.");

  const amenities: string[] = [];
  if (high(f, "doorman")) amenities.push("a full-time doorman");
  if (high(f, "gym")) amenities.push("a fitness center");
  if (high(f, "elevator") && !high(f, "doorman")) amenities.push("an elevator");
  if (high(f, "in_unit_laundry")) amenities.push("an in-unit washer/dryer");
  if (high(f, "parking")) amenities.push(type === "single_family" || type === "multi_family" ? "a driveway and garage" : "deeded parking");
  if (amenities.length > 0) sentences.push(`Includes ${joinList(amenities)}.`);
  if (high(f, "outdoor_space", 0.8)) sentences.push(type === "single_family" || type === "multi_family" ? "The backyard is ready for summer dinners." : "A private terrace extends the living space outdoors.");
  else if (high(f, "balcony", 0.8)) sentences.push("A private balcony catches the afternoon breeze.");
  if (high(f, "home_office")) sentences.push("A windowed nook works well as a home office.");

  if (high(f, "water_views", 0.8)) sentences.push("Enjoy open views of the water.");
  if (high(f, "near_transit", 0.8)) sentences.push("The subway is a few minutes' walk away.");
  else if (f.near_transit < 0.4) sentences.push("Transit is a drive or bus ride away; most neighbors keep a car.");
  if (high(f, "quiet", 0.75)) sentences.push("The block is quiet and tree-lined.");
  else if (high(f, "dense_urban", 0.8)) sentences.push("Restaurants, cafés and nightlife are right outside the door.");

  return { headline, description: sentences.join(" ") };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function semanticDescription(beds: number, type: PropertyType, hood: NeighborhoodProfile, f: Record<string, number>): string {
  const labelsFor = (category: string) =>
    DIMENSIONS.filter((d) => d.category === category && (f[d.key] ?? 0) >= 0.6).map((d) => d.label.toLowerCase());
  const parts = [
    `${beds === 0 ? "Studio" : `${beds}-bedroom`} ${PROPERTY_TYPE_LABEL[type].toLowerCase()} in ${hood.name}, ${hood.borough}.`,
    `Style and finishes: ${labelsFor("visual").join(", ") || "simple finishes"}.`,
    `Layout: ${labelsFor("layout").join(", ") || "standard layout"}.`,
    `Amenities: ${labelsFor("amenity").join(", ") || "none notable"}.`,
    `Building: ${labelsFor("building").join(", ") || "mid-rise"}.`,
    `Setting: ${labelsFor("location").join(", ") || "residential"}.`,
  ];
  return parts.join(" ");
}

function structuredFeatures(f: Record<string, number>): string[] {
  const out = DIMENSIONS.filter(
    (d) => (f[d.key] ?? 0) >= 0.65 && !["dark_interior", "dated_finishes", "dated_kitchen", "carpet", "dense_urban", "low_rise", "traditional"].includes(d.key),
  ).map((d) => d.label);
  if (f.renovated >= 0.6) out.push("Dishwasher");
  if (f.new_construction >= 0.6) out.push("Central air");
  if (f.carpet >= 0.6) out.push("Carpeted living areas");
  return out;
}

function roomAlt(room: string, hood: NeighborhoodProfile, type: PropertyType, f: Record<string, number>): string {
  const light = f.natural_light >= 0.65 ? "Bright" : f.natural_light <= 0.4 ? "Softly lit" : "Comfortable";
  const typeLabel = PROPERTY_TYPE_LABEL[type].toLowerCase();
  if (room === "exterior") return `Exterior of a ${typeLabel} in ${hood.name}`;
  return `${light} ${room} in a ${hood.name} ${typeLabel}`;
}

function pickImage(rng: Rng, pool: ImagePool, used: Set<string>): string {
  const options = IMAGE_POOLS[pool].filter((id) => !used.has(id));
  const id = pick(rng, options.length > 0 ? options : IMAGE_POOLS[pool]);
  used.add(id);
  return id;
}

function buildMedia(rng: Rng, arch: Archetype, hood: NeighborhoodProfile, type: PropertyType, f: Record<string, number>): PropertyMedia[] {
  const used = new Set<string>();
  const bright = f.natural_light >= 0.5;
  const isHouse = type === "single_family" || type === "multi_family";
  const modern = f.modern_interior >= 0.6;
  const media: { id: string; room: string }[] = [];

  const heroPools: ImagePool[] = modern && !arch.images.hero.includes("interiorIndustrial") ? ["interiorBrightModern", "interiorMinimalist"] : bright ? arch.images.hero : arch.images.heroDark;
  if (isHouse) {
    media.push({ id: pickImage(rng, modern ? "exteriorHouseModern" : "exteriorHouseTraditional", used), room: "exterior" });
    media.push({ id: pickImage(rng, pick(rng, heroPools), used), room: "living room" });
  } else {
    media.push({ id: pickImage(rng, pick(rng, heroPools), used), room: "living room" });
  }
  media.push({ id: pickImage(rng, f.renovated >= 0.6 || f.open_kitchen >= 0.65 ? arch.images.kitchenRenovated : arch.images.kitchen, used), room: "kitchen" });
  media.push({ id: pickImage(rng, bright ? "bedroomBright" : "bedroomDark", used), room: "bedroom" });
  if (rng() < 0.5) media.push({ id: pickImage(rng, "diningModern", used), room: "dining area" });
  media.push({ id: pickImage(rng, f.renovated >= 0.55 ? "bathModern" : "bathDated", used), room: "bathroom" });
  if (!isHouse && arch.images.exterior && rng() < 0.7) media.push({ id: pickImage(rng, arch.images.exterior, used), room: "exterior" });

  return media.map((m) => ({
    url: unsplashUrl(m.id),
    type: "image" as const,
    room: m.room,
    alt: roomAlt(m.room, hood, type, f),
    credit: "Photo via Unsplash (Unsplash License)",
  }));
}

export function generateSeedProperties(referenceDate: Date = SEED_REFERENCE_DATE): Property[] {
  const rng = createRng(SEED);
  const properties: Property[] = [];
  let counter = 0;
  for (const arch of ARCHETYPES) {
    for (let i = 0; i < arch.count; i++) {
      counter++;
      const hoodName = pick(rng, arch.neighborhoods);
      const hood = NEIGHBORHOODS.find((n) => n.name === hoodName);
      if (!hood) throw new Error(`Unknown neighborhood ${hoodName}`);
      const type = pick(rng, arch.propertyTypes);
      const beds = pick(rng, arch.bedrooms);
      const yearBuilt = Math.round(between(rng, arch.yearBuilt));
      const floors = Math.round(between(rng, arch.floors));
      const floor = Math.max(1, Math.round(1 + rng() * (floors - 1)));
      const f = sampleFeatures(rng, arch, hood, yearBuilt, floors);
      const sqft = Math.round((beds === 0 ? between(rng, [410, 560]) : beds * between(rng, arch.sqftPerBed) + rng() * 250) / 10) * 10;
      const baths = bathroomsFor(rng, beds, type);
      const price = priceFor(rng, sqft, hood, arch, type, f);
      const hoa = type === "condo" ? Math.round(sqft * (0.9 + rng() * 0.6)) : type === "co-op" ? Math.round(sqft * (1.5 + rng() * 0.6)) : 0;
      const taxesAnnual = type === "co-op" ? 0 : Math.round(price * (type === "condo" ? 0.0105 : 0.0075));
      const [street, cross] = pick(rng, hood.streets);
      const unit = type === "single_family" || type === "multi_family" || type === "townhouse" ? "" : ` #${floor}${String.fromCharCode(65 + Math.floor(rng() * 6))}`;
      const jitter = () => (rng() - 0.5) * 0.012;
      const latitude = Math.round((hood.lat + jitter()) * 1e5) / 1e5;
      const longitude = Math.round((hood.lng + jitter()) * 1e5) / 1e5;
      const listedAt = new Date(referenceDate.getTime() - Math.floor(rng() * 75) * 86_400_000);
      const { headline, description } = buildDescription(rng, { beds, type, hood, arch, f, floor, floors });
      const id = `hs-${String(counter).padStart(4, "0")}`;
      const visualAttributes = DIMENSIONS.filter((d) => (d.category === "visual" || d.category === "layout") && f[d.key] >= 0.6).map((d) => d.label);
      const lifestyleAttributes = DIMENSIONS.filter((d) => (d.category === "amenity" || d.category === "location" || d.category === "building") && f[d.key] >= 0.6).map((d) => d.label);

      properties.push({
        id,
        source: { provider: "seed", externalId: `${arch.key}-${i + 1}` },
        status: "active",
        listingType: "sale",
        listedAt,
        address: {
          formatted: `${street} & ${cross}${unit}, ${hood.city}, NY ${hood.zip}`,
          city: hood.city,
          state: "NY",
          zip: hood.zip,
          borough: hood.borough,
          neighborhood: hood.name,
          latitude,
          longitude,
        },
        financial: {
          price,
          hoa: hoa > 0 ? hoa : undefined,
          taxesAnnual: taxesAnnual > 0 ? taxesAnnual : undefined,
          estimatedMonthly: monthlyPayment(price, hoa, taxesAnnual),
        },
        facts: {
          propertyType: type,
          bedrooms: beds,
          bathrooms: baths,
          sqft,
          lotSize: type === "single_family" || type === "multi_family" ? Math.round(between(rng, [2500, 6500]) / 50) * 50 : undefined,
          yearBuilt,
          floor: unit ? floor : undefined,
        },
        headline,
        description,
        features: structuredFeatures(f),
        media: buildMedia(rng, arch, hood, type, f),
        ai: {
          semanticDescription: semanticDescription(beds, type, hood, f),
          visualAttributes,
          lifestyleAttributes,
          features: f,
          featureVector: toFeatureVector(f),
          featureSpaceVersion: FEATURE_SPACE_VERSION,
        },
        createdAt: referenceDate,
        updatedAt: referenceDate,
      });
    }
  }
  return properties;
}

/** Human label of the strongest distinctive dimensions — handy for debugging and docs. */
export function describeFeatures(f: Record<string, number>): string {
  return Object.entries(f)
    .filter(([, v]) => v >= 0.75)
    .map(([k]) => getDimension(k)?.label ?? k)
    .join(", ");
}
