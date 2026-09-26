/**
 * Fair-housing guardrail. SwipeHome personalizes on property attributes, price, user-selected
 * geography and amenities only. No preference dimension, memory, policy feature weight, or
 * parsed query attribute may describe protected-class traits (race, color, religion, sex,
 * disability, familial status, national origin — plus NYC-protected age, marital status,
 * gender identity, sexual orientation) or common proxies for them.
 *
 * Every write path that stores or optimizes on a dimension key or free-text preference
 * statement must pass through this module.
 */

const BLOCKED_TOKENS = new Set([
  // race / color / ethnicity / national origin
  "race", "racial", "ethnic", "ethnicity", "ethnically", "minority", "minorities", "caucasian", "hispanic",
  "latino", "latina", "latinx", "asian", "african", "arab", "european", "immigrant", "immigrants",
  "foreign", "foreigner", "foreigners", "nationality", "national", "citizenship", "citizen", "citizens",
  "ancestry", "heritage", "accent", "speaking", "language",
  // religion
  "religion", "religious", "church", "churches", "mosque", "mosques", "synagogue", "synagogues",
  "temple", "temples", "worship", "christian", "christians", "muslim", "muslims", "jewish", "jew", "jews",
  "catholic", "hindu", "buddhist", "sikh", "kosher", "halal", "parish",
  // sex / gender / orientation
  "gender", "sex", "male", "female", "men", "women", "man", "woman", "gay", "lesbian", "lgbt", "lgbtq",
  "queer", "transgender", "straight",
  // familial / marital status and age
  "family", "families", "familial", "kid", "kids", "child", "children", "childless", "baby", "babies",
  "toddler", "teen", "teens", "pregnant", "married", "marital", "singles", "bachelor",
  "couples", "senior", "seniors", "elderly", "retiree", "retirees", "young", "youth", "adult", "adults",
  "school", "schools", "playground",
  // disability (inferring a user's disability — physical accessibility features are fine)
  "disability", "disabled", "handicap", "handicapped", "blind", "deaf", "impaired", "illness",
  // demographic composition
  "demographic", "demographics", "population", "residents", "neighbors", "community", "communities",
  "diverse", "diversity", "homogeneous", "crime", "safe", "safety", "dangerous", "ghetto", "exclusive",
  "people", "crowd", "income",
]);

/** Color words are only blocked when combined with people/place tokens ("white_neighborhood"). */
const COLOR_TOKENS = new Set(["black", "white", "brown"]);
const PEOPLE_PLACE_TOKENS = new Set(["neighborhood", "area", "block", "residents", "people", "community", "tenants", "owners"]);

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** Building-type terms that contain a blocked token but describe the structure, not occupants. */
const ALLOWED_EXCEPTIONS = new Set(["single_family", "multi_family", "two_family"]);

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function checkTokens(tokens: string[]): GuardrailResult {
  for (const token of tokens) {
    if (BLOCKED_TOKENS.has(token)) {
      return { allowed: false, reason: `"${token}" relates to a protected characteristic or a proxy for one` };
    }
  }
  if (tokens.some((t) => COLOR_TOKENS.has(t)) && tokens.some((t) => PEOPLE_PLACE_TOKENS.has(t))) {
    return { allowed: false, reason: "color terms combined with people or places can proxy for race" };
  }
  return { allowed: true };
}

export function checkDimensionKey(key: string): GuardrailResult {
  if (!KEY_PATTERN.test(key)) return { allowed: false, reason: "dimension keys must be snake_case identifiers" };
  if (ALLOWED_EXCEPTIONS.has(key)) return { allowed: true };
  return checkTokens(key.split("_"));
}

export function isAllowedDimension(key: string): boolean {
  return checkDimensionKey(key).allowed;
}

export function assertAllowedDimension(key: string): void {
  const result = checkDimensionKey(key);
  if (!result.allowed) throw new FairHousingViolation(key, result.reason ?? "blocked");
}

/** Removes blocked keys from a record; returns the kept record and the rejected keys. */
export function filterAllowedRecord<T>(record: Record<string, T>): { kept: Record<string, T>; rejected: string[] } {
  const kept: Record<string, T> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (isAllowedDimension(key)) kept[key] = value;
    else rejected.push(key);
  }
  return { kept, rejected };
}

export function filterAllowedDimensions(keys: string[]): string[] {
  return keys.filter(isAllowedDimension);
}

/** Checks free text (memory statements, LLM output) before it is stored or used for ranking. */
export function checkPreferenceText(text: string): GuardrailResult {
  return checkTokens(tokenize(text));
}

export class FairHousingViolation extends Error {
  constructor(
    public readonly subject: string,
    public readonly reason: string,
  ) {
    super(`Fair-housing guardrail blocked "${subject}": ${reason}`);
    this.name = "FairHousingViolation";
  }
}
