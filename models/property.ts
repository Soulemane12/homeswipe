import { z } from "zod";

export const PROPERTY_TYPES = ["condo", "co-op", "townhouse", "single_family", "multi_family"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  condo: "Condo",
  "co-op": "Co-op",
  townhouse: "Townhouse",
  single_family: "Single-family",
  multi_family: "Multi-family",
};

export const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;
export type Borough = (typeof BOROUGHS)[number];

export const LISTING_TYPES = ["sale", "rent"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const MediaSchema = z.object({
  url: z.string().url(),
  type: z.enum(["image", "video"]),
  alt: z.string().optional(),
  room: z.string().optional(),
  credit: z.string().optional(),
});

export const PropertySchema = z.object({
  id: z.string().min(1),
  source: z.object({
    provider: z.string(),
    externalId: z.string(),
    lastSyncedAt: z.coerce.date().optional(),
  }),
  status: z.enum(["active", "pending", "sold"]),
  listingType: z.enum(LISTING_TYPES),
  listedAt: z.coerce.date(),
  address: z.object({
    formatted: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string().optional(),
    borough: z.enum(BOROUGHS),
    neighborhood: z.string(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  financial: z.object({
    price: z.number().positive(),
    hoa: z.number().nonnegative().optional(),
    taxesAnnual: z.number().nonnegative().optional(),
    estimatedMonthly: z.number().nonnegative().optional(),
  }),
  facts: z.object({
    propertyType: z.enum(PROPERTY_TYPES),
    bedrooms: z.number().int().nonnegative(),
    bathrooms: z.number().nonnegative(),
    sqft: z.number().positive().optional(),
    lotSize: z.number().positive().optional(),
    yearBuilt: z.number().int().optional(),
    floor: z.number().int().optional(),
  }),
  headline: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  media: z.array(MediaSchema),
  ai: z.object({
    semanticDescription: z.string(),
    visualAttributes: z.array(z.string()),
    lifestyleAttributes: z.array(z.string()),
    /** Named dimension values in [0, 1]. */
    features: z.record(z.string(), z.number().min(0).max(1)),
    /** Fixed-order local feature vector (see lib/features/dimensions.ts). */
    featureVector: z.array(z.number()),
    featureSpaceVersion: z.string(),
    embedding: z.array(z.number()).optional(),
    embeddingModel: z.string().optional(),
  }),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Property = z.infer<typeof PropertySchema>;
export type PropertyMedia = z.infer<typeof MediaSchema>;

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

/** MongoDB document shape: `_id` is the property id; address carries a GeoJSON point for 2dsphere. */
export type PropertyDoc = Omit<Property, "id" | "address"> & {
  _id: string;
  address: Property["address"] & { location: GeoPoint };
};

export function toPropertyDoc(property: Property): PropertyDoc {
  const { id, address, ...rest } = property;
  return {
    _id: id,
    ...rest,
    address: { ...address, location: { type: "Point", coordinates: [address.longitude, address.latitude] } },
  };
}

export function fromPropertyDoc(doc: PropertyDoc): Property {
  const { _id, address, ...rest } = doc;
  const { location: _location, ...plainAddress } = address;
  void _location;
  return { id: _id, ...rest, address: plainAddress };
}
