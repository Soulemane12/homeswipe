import seedData from "@/data/seed-properties.json";
import { SEED_REFERENCE_DATE } from "@/lib/seed/generate";
import { PropertySchema, type Property } from "@/models/property";
import type { PropertyProvider, PropertySearchParams } from "./types";

/**
 * Reliable offline provider backed by the committed, deterministic seed dataset. Listing dates
 * are re-based to "now" so freshness behaves the same whenever the demo is seeded.
 */
export class SeedPropertyProvider implements PropertyProvider {
  readonly name = "seed";
  private readonly properties: Property[];

  constructor(now: Date = new Date()) {
    const shift = now.getTime() - SEED_REFERENCE_DATE.getTime();
    this.properties = (seedData as unknown[]).map((raw) => {
      const p = PropertySchema.parse(raw);
      return {
        ...p,
        listedAt: new Date(p.listedAt.getTime() + shift),
        createdAt: now,
        updatedAt: now,
        source: { ...p.source, lastSyncedAt: now },
      };
    });
  }

  async search(params: PropertySearchParams): Promise<Property[]> {
    const results = this.properties.filter(
      (p) =>
        (params.minPrice === undefined || p.financial.price >= params.minPrice) &&
        (params.maxPrice === undefined || p.financial.price <= params.maxPrice) &&
        (params.minBedrooms === undefined || p.facts.bedrooms >= params.minBedrooms) &&
        (params.minBathrooms === undefined || p.facts.bathrooms >= params.minBathrooms) &&
        (!params.propertyTypes?.length || params.propertyTypes.includes(p.facts.propertyType)) &&
        (!params.city || p.address.city.toLowerCase() === params.city.toLowerCase()),
    );
    return results.slice(0, params.limit ?? results.length);
  }

  async getProperty(id: string): Promise<Property | null> {
    return this.properties.find((p) => p.id === id) ?? null;
  }
}
