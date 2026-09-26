import { BOROUGHS, PROPERTY_TYPES, type Borough, type PropertyType } from "@/models/property";
import type { HardConstraints } from "@/models/user";

export interface FilterState {
  boroughs: Borough[];
  neighborhoods: string[];
  excludeNeighborhoods: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyTypes: PropertyType[];
  minSqft?: number;
  maxHoa?: number;
  minYearBuilt?: number;
  features: string[];
}

const NUMERIC = ["minPrice", "maxPrice", "minBedrooms", "minBathrooms", "minSqft", "maxHoa", "minYearBuilt"] as const;
const LISTS = ["boroughs", "neighborhoods", "excludeNeighborhoods", "propertyTypes", "features"] as const;

export function emptyFilters(): FilterState {
  return { boroughs: [], neighborhoods: [], excludeNeighborhoods: [], propertyTypes: [], features: [] };
}

export function filtersFromConstraints(c: HardConstraints): FilterState {
  return {
    ...emptyFilters(),
    boroughs: c.boroughs,
    propertyTypes: c.propertyTypes,
    maxPrice: c.maxPrice,
    minPrice: c.minPrice,
    minBedrooms: c.minBedrooms || undefined,
    minBathrooms: c.minBathrooms || undefined,
  };
}

export function hasFilterParams(params: Record<string, string | undefined>): boolean {
  return [...NUMERIC, ...LISTS].some((k) => params[k] !== undefined && params[k] !== "");
}

export function filtersFromParams(params: Record<string, string | undefined>): FilterState {
  const f = emptyFilters();
  for (const key of NUMERIC) {
    const v = params[key];
    if (v !== undefined && v !== "" && Number.isFinite(Number(v))) f[key] = Number(v);
  }
  const list = (key: string) => (params[key] ? params[key]!.split(",").map((s) => s.trim()).filter(Boolean) : []);
  f.boroughs = list("boroughs").filter((b): b is Borough => (BOROUGHS as readonly string[]).includes(b));
  f.propertyTypes = list("propertyTypes").filter((t): t is PropertyType => (PROPERTY_TYPES as readonly string[]).includes(t));
  f.neighborhoods = list("neighborhoods");
  f.excludeNeighborhoods = list("excludeNeighborhoods");
  f.features = list("features");
  return f;
}

export function filtersToParams(f: FilterState, extra: Record<string, string | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  for (const key of NUMERIC) if (f[key] !== undefined) params.set(key, String(f[key]));
  for (const key of LISTS) if (f[key].length > 0) params.set(key, f[key].join(","));
  return params;
}

/** Request payload: omit empty values so parsed-query constraints can fill them. */
export function filtersToRequest(f: FilterState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of NUMERIC) if (f[key] !== undefined) out[key] = f[key];
  for (const key of LISTS) if (f[key].length > 0) out[key] = f[key];
  return out;
}
