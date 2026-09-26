/**
 * Centralized interaction signal strengths. Positive values are evidence the user likes a
 * property's attributes; negative values are evidence against. Passive signals are
 * deliberately weak — they are not equivalent to an explicit like.
 */
export const INTERACTION_TYPES = [
  "like",
  "dislike",
  "super_like",
  "save",
  "unsave",
  "detail_open",
  "image_view",
  "compare_add",
  "find_similar",
  "preference_correction",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const SIGNAL_STRENGTH: Record<InteractionType, number> = {
  super_like: 1.5,
  save: 1.2,
  like: 1.0,
  find_similar: 0.6,
  compare_add: 0.4,
  detail_open: 0.2,
  image_view: 0.05,
  unsave: -0.4,
  dislike: -1.0,
  preference_correction: 0,
};

/** A dislike this fast is a stronger negative ("instant no"). */
export const RAPID_DISLIKE_MS = 1500;
export const RAPID_DISLIKE_MULTIPLIER = 1.3;

/** Long dwell on a card or detail page is a weak positive, added on top of the base signal. */
export const LONG_DWELL_MS = 8000;
export const LONG_DWELL_BONUS = 0.15;

/** Saving into a collection with intent ("Dream Homes") is a stronger style signal. */
export const COLLECTION_KINDS = ["favorites", "dream", "tour", "custom"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];
export const COLLECTION_SIGNAL_MULTIPLIER: Record<CollectionKind, number> = {
  favorites: 1.0,
  dream: 1.4,
  tour: 1.2,
  custom: 1.0,
};

/** Interaction types that resolve a feed prediction into a labeled outcome. */
export const DECISIVE_OUTCOME: Partial<Record<InteractionType, "LIKE" | "DISLIKE">> = {
  like: "LIKE",
  super_like: "LIKE",
  save: "LIKE",
  dislike: "DISLIKE",
};

/** Types counted toward the batched preference-update threshold. */
export const MEANINGFUL_TYPES: readonly InteractionType[] = [
  "like",
  "dislike",
  "super_like",
  "save",
  "unsave",
  "find_similar",
  "compare_add",
  "preference_correction",
];

export interface SignalInput {
  type: InteractionType;
  dwellMs?: number;
  collectionKind?: CollectionKind;
}

export function interactionSignal(input: SignalInput): number {
  let signal = SIGNAL_STRENGTH[input.type];
  const dwell = typeof input.dwellMs === "number" ? input.dwellMs : undefined;
  if (input.type === "dislike" && dwell !== undefined && dwell < RAPID_DISLIKE_MS) {
    signal *= RAPID_DISLIKE_MULTIPLIER;
  }
  if (signal > 0 && dwell !== undefined && dwell >= LONG_DWELL_MS) {
    signal += LONG_DWELL_BONUS;
  }
  if (input.type === "save" && input.collectionKind) {
    signal *= COLLECTION_SIGNAL_MULTIPLIER[input.collectionKind];
  }
  return signal;
}

export function isRapidDislike(input: SignalInput): boolean {
  return input.type === "dislike" && typeof input.dwellMs === "number" && input.dwellMs < RAPID_DISLIKE_MS;
}
