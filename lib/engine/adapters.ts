import type { Property } from "@/models/property";
import type { EngineProperty } from "./types";

export function toEngineProperty(p: Property): EngineProperty {
  return {
    id: p.id,
    price: p.financial.price,
    bedrooms: p.facts.bedrooms,
    bathrooms: p.facts.bathrooms,
    sqft: p.facts.sqft,
    propertyType: p.facts.propertyType,
    borough: p.address.borough,
    neighborhood: p.address.neighborhood,
    listingType: p.listingType,
    status: p.status,
    listedAt: new Date(p.listedAt),
    latitude: p.address.latitude,
    longitude: p.address.longitude,
    features: p.ai.features,
    featureVector: p.ai.featureVector,
    embedding: p.ai.embedding,
    embeddingModel: p.ai.embeddingModel,
  };
}
