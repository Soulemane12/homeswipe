import type { ObjectId } from "mongodb";
import { z } from "zod";
import { COLLECTION_KINDS, INTERACTION_TYPES, type CollectionKind, type InteractionType } from "@/lib/config/signals";
import type { ExplicitCorrection } from "@/lib/engine/types";

export const SOURCE_SURFACES = ["discover", "swipe", "search", "map", "property", "saved", "compare", "home_dna", "command", "simulation"] as const;
export type SourceSurface = (typeof SOURCE_SURFACES)[number];

export const CorrectionSchema = z.object({
  dimension: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
  stance: z.enum(["important", "neutral", "not_important"]),
  direction: z.enum(["positive", "negative"]),
});

export const InteractionInputSchema = z.object({
  propertyId: z.string().min(1).optional(),
  type: z.enum(INTERACTION_TYPES),
  impressionId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  dwellMs: z.number().int().nonnegative().max(3_600_000).optional(),
  photosViewed: z.number().int().nonnegative().max(200).optional(),
  sourceSurface: z.enum(SOURCE_SURFACES),
  collectionKind: z.enum(COLLECTION_KINDS).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type InteractionInput = z.infer<typeof InteractionInputSchema>;

export interface InteractionDoc {
  _id: ObjectId;
  userId: string;
  propertyId?: string;
  type: InteractionType;
  createdAt: Date;
  dwellMs?: number;
  photosViewed?: number;
  sourceSurface: SourceSurface;
  impressionId?: ObjectId;
  collectionKind?: CollectionKind;
  /** Synthetic interactions from the /lab simulator — always excluded from real-user metrics by default. */
  simulated: boolean;
  metadata?: {
    corrections?: ExplicitCorrection[];
    attribution?: Record<string, number>;
    targetInteractionId?: string;
    text?: string;
    anchorPropertyId?: string;
    hiddenProfile?: string;
    [key: string]: unknown;
  };
}
