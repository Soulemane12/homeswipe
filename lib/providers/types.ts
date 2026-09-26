import type { Property, PropertyType } from "@/models/property";

export interface PropertySearchParams {
  city?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyTypes?: PropertyType[];
  limit?: number;
}

/**
 * Source of listing inventory. Providers normalize raw data into the domain `Property` model;
 * the app itself always reads from MongoDB, so UI code never touches provider payloads.
 */
export interface PropertyProvider {
  readonly name: string;
  search(params: PropertySearchParams): Promise<Property[]>;
  getProperty(id: string): Promise<Property | null>;
}
