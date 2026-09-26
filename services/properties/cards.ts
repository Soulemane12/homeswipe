import { displayMatch } from "@/lib/engine/prediction";
import type { ScoredProperty } from "@/lib/engine/types";
import type { PropertyCardData } from "@/models/card";
import type { Property } from "@/models/property";

export function toCard(p: Property, options: { scored?: ScoredProperty; saved?: boolean; impressionId?: string; judge?: PropertyCardData["judge"] } = {}): PropertyCardData {
  const { scored } = options;
  return {
    id: p.id,
    headline: p.headline,
    price: p.financial.price,
    neighborhood: p.address.neighborhood,
    borough: p.address.borough,
    formattedAddress: p.address.formatted,
    bedrooms: p.facts.bedrooms,
    bathrooms: p.facts.bathrooms,
    sqft: p.facts.sqft,
    propertyType: p.facts.propertyType,
    hoa: p.financial.hoa,
    latitude: p.address.latitude,
    longitude: p.address.longitude,
    media: p.media.filter((m) => m.type === "image").slice(0, 6).map((m) => ({ url: m.url, alt: m.alt ?? `${p.headline} in ${p.address.neighborhood}` })),
    saved: options.saved,
    impressionId: options.impressionId,
    match: scored
      ? {
          percent: displayMatch(scored.breakdown.fit),
          reasons: scored.reasons.slice(0, 3).map((r) => r.text),
          tradeoffs: scored.tradeoffs.slice(0, 2).map((r) => r.text),
        }
      : undefined,
    judge: options.judge,
  };
}
