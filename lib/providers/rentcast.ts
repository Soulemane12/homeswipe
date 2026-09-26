import "server-only";
import { FEATURE_SPACE_VERSION, DIMENSIONS, toFeatureVector } from "@/lib/features/dimensions";
import { featuresFromText } from "@/lib/features/lexicon";
import type { Borough, Property, PropertyType } from "@/models/property";
import type { PropertyProvider, PropertySearchParams } from "./types";

const BASE_URL = "https://api.rentcast.io/v1";

interface RentCastListing {
  id: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  status?: string;
  price?: number;
  listedDate?: string;
  hoa?: { fee?: number };
}

const TYPE_MAP: Record<string, PropertyType> = {
  Condo: "condo",
  Apartment: "co-op",
  Townhouse: "townhouse",
  "Single Family": "single_family",
  "Multi-Family": "multi_family",
};

const QUEENS_CITIES = ["queens", "astoria", "long island city", "forest hills", "sunnyside", "flushing", "jackson heights", "jamaica", "ridgewood"];

function boroughFor(city: string): Borough | null {
  const c = city.toLowerCase();
  if (c === "new york" || c === "manhattan") return "Manhattan";
  if (c === "brooklyn") return "Brooklyn";
  if (c === "bronx") return "Bronx";
  if (c === "staten island") return "Staten Island";
  if (QUEENS_CITIES.includes(c)) return "Queens";
  return null;
}

/**
 * RentCast sale listings (requires RENTCAST_API_KEY). RentCast provides structured facts but no
 * photos or descriptions, so derived features are sparse and the UI shows generated artwork.
 */
export class RentCastPropertyProvider implements PropertyProvider {
  readonly name = "rentcast";
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { "X-Api-Key": this.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`RentCast ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  async search(params: PropertySearchParams): Promise<Property[]> {
    const listings = await this.request<RentCastListing[]>("/listings/sale", {
      city: params.city ?? "Brooklyn",
      state: params.state ?? "NY",
      status: "Active",
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      bedrooms: params.minBedrooms,
      limit: params.limit ?? 50,
    });
    return listings.map((l) => this.normalize(l)).filter((p): p is Property => p !== null);
  }

  async getProperty(id: string): Promise<Property | null> {
    const listing = await this.request<RentCastListing>(`/listings/sale/${encodeURIComponent(id)}`, {});
    return this.normalize(listing);
  }

  private normalize(l: RentCastListing): Property | null {
    const borough = l.city ? boroughFor(l.city) : null;
    const type = l.propertyType ? TYPE_MAP[l.propertyType] : undefined;
    if (!borough || !type || !l.price || l.latitude === undefined || l.longitude === undefined) return null;
    const now = new Date();
    const text = `${l.propertyType ?? ""} ${l.formattedAddress ?? ""}`;
    const features: Record<string, number> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, 0.3]));
    Object.assign(features, featuresFromText(text));
    if (l.yearBuilt) {
      features.prewar = l.yearBuilt < 1945 ? 0.9 : 0.05;
      features.new_construction = l.yearBuilt >= 2015 ? 0.9 : 0.05;
    }
    if (type === "single_family" || type === "multi_family") {
      features.suburban_feel = 0.6;
      features.outdoor_space = 0.6;
    }
    const beds = l.bedrooms ?? 0;
    const label = `${beds === 0 ? "Studio" : `${beds}BR`} ${type.replace("_", "-")}`;
    return {
      id: `rc-${l.id}`,
      source: { provider: "rentcast", externalId: l.id, lastSyncedAt: now },
      status: "active",
      listingType: "sale",
      listedAt: l.listedDate ? new Date(l.listedDate) : now,
      address: {
        formatted: l.formattedAddress ?? l.addressLine1 ?? "Address withheld",
        city: l.city!,
        state: l.state ?? "NY",
        zip: l.zipCode,
        borough,
        neighborhood: l.city!,
        latitude: l.latitude,
        longitude: l.longitude,
      },
      financial: { price: l.price, hoa: l.hoa?.fee },
      facts: {
        propertyType: type,
        bedrooms: beds,
        bathrooms: l.bathrooms ?? 1,
        sqft: l.squareFootage,
        lotSize: l.lotSize,
        yearBuilt: l.yearBuilt,
      },
      headline: `${label} in ${l.city}`,
      description: `${label} listed via RentCast. Structured facts only; photos and descriptions are not provided by this source.`,
      features: [],
      media: [],
      ai: {
        semanticDescription: `${label} in ${l.city}, ${borough}.`,
        visualAttributes: [],
        lifestyleAttributes: [],
        features,
        featureVector: toFeatureVector(features),
        featureSpaceVersion: FEATURE_SPACE_VERSION,
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
