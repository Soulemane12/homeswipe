import type { HardConstraints } from "@/models/user";
import type { EngineProperty } from "./types";

/**
 * Hard constraints are applied before any personalization and are never modified by the
 * harness. `toMongoFilter` produces the query/prefilter; `satisfiesHardConstraints` is the
 * same rule in code, used as a defense-in-depth assertion after ranking.
 */
export function satisfiesHardConstraints(p: EngineProperty, c: HardConstraints): boolean {
  if (p.status !== "active") return false;
  if (p.listingType !== c.listingType) return false;
  if (typeof c.maxPrice === "number" && p.price > c.maxPrice) return false;
  if (typeof c.minPrice === "number" && p.price < c.minPrice) return false;
  if (p.bedrooms < c.minBedrooms) return false;
  if (p.bathrooms < c.minBathrooms) return false;
  if (c.propertyTypes.length > 0 && !c.propertyTypes.includes(p.propertyType)) return false;
  if (c.boroughs.length > 0 && !c.boroughs.includes(p.borough)) return false;
  if (c.neighborhoods.length > 0 && !c.neighborhoods.includes(p.neighborhood)) return false;
  return true;
}

export type MongoFilter = Record<string, unknown>;

/** Filter over the `properties` collection (field paths match PropertyDoc). */
export function toMongoFilter(c: HardConstraints): MongoFilter {
  const filter: MongoFilter = { status: "active", listingType: c.listingType };
  const price: Record<string, number> = {};
  if (typeof c.maxPrice === "number") price.$lte = c.maxPrice;
  if (typeof c.minPrice === "number") price.$gte = c.minPrice;
  if (Object.keys(price).length > 0) filter["financial.price"] = price;
  if (c.minBedrooms > 0) filter["facts.bedrooms"] = { $gte: c.minBedrooms };
  if (c.minBathrooms > 0) filter["facts.bathrooms"] = { $gte: c.minBathrooms };
  if (c.propertyTypes.length > 0) filter["facts.propertyType"] = { $in: c.propertyTypes };
  if (c.boroughs.length > 0) filter["address.borough"] = { $in: c.boroughs };
  if (c.neighborhoods.length > 0) filter["address.neighborhood"] = { $in: c.neighborhoods };
  return filter;
}

/**
 * Atlas Vector Search prefilter. Only fields indexed as `filter` in the vector index may be
 * used, and only a subset of MQL operators — this mirrors toMongoFilter within those limits.
 */
export function toVectorSearchFilter(c: HardConstraints, extra: MongoFilter = {}): MongoFilter {
  const clauses: MongoFilter[] = [{ status: { $eq: "active" } }, { listingType: { $eq: c.listingType } }];
  if (typeof c.maxPrice === "number") clauses.push({ "financial.price": { $lte: c.maxPrice } });
  if (typeof c.minPrice === "number") clauses.push({ "financial.price": { $gte: c.minPrice } });
  if (c.minBedrooms > 0) clauses.push({ "facts.bedrooms": { $gte: c.minBedrooms } });
  if (c.minBathrooms > 0) clauses.push({ "facts.bathrooms": { $gte: c.minBathrooms } });
  if (c.propertyTypes.length > 0) clauses.push({ "facts.propertyType": { $in: c.propertyTypes } });
  if (c.boroughs.length > 0) clauses.push({ "address.borough": { $in: c.boroughs } });
  if (c.neighborhoods.length > 0) clauses.push({ "address.neighborhood": { $in: c.neighborhoods } });
  for (const [key, value] of Object.entries(extra)) clauses.push({ [key]: value });
  return { $and: clauses };
}

/** Merges search-time filters into the user's constraints; explicit search values win. */
export function mergeConstraints(base: HardConstraints, override: Partial<HardConstraints>): HardConstraints {
  const merged: HardConstraints = { ...base };
  for (const [key, value] of Object.entries(override) as [keyof HardConstraints, unknown][]) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
