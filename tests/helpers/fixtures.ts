import { DIMENSION_KEYS, toFeatureVector } from "@/lib/features/dimensions";
import type { EngineInteraction, EngineProperty } from "@/lib/engine/types";
import type { HardConstraints } from "@/models/user";

export const ANY: HardConstraints = { listingType: "sale", minBedrooms: 0, minBathrooms: 0, propertyTypes: [], boroughs: [], neighborhoods: [] };

let counter = 0;
export function makeProperty(overrides: Partial<EngineProperty> & { f?: Record<string, number> } = {}): EngineProperty {
  const features: Record<string, number> = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 0.3]));
  Object.assign(features, overrides.f ?? {});
  counter++;
  return {
    id: overrides.id ?? `p${counter}`,
    price: 900_000,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    propertyType: "condo",
    borough: "Brooklyn",
    neighborhood: "Park Slope",
    listingType: "sale",
    status: "active",
    listedAt: new Date("2026-09-01"),
    latitude: 40.67,
    longitude: -73.98,
    ...overrides,
    features,
    featureVector: toFeatureVector(features),
  };
}

export function interaction(id: string, propertyId: string, type: EngineInteraction["type"], minute: number, extra: Partial<EngineInteraction> = {}): EngineInteraction {
  return { id, propertyId, type, createdAt: new Date(Date.UTC(2026, 8, 1, 12, minute)), simulated: false, ...extra };
}
