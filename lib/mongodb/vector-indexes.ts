import { FEATURE_DIM } from "@/lib/features/dimensions";

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_INDEX_NAME = "property_embedding_index";
export const FEATURE_INDEX_NAME = "property_feature_index";

/** Fields usable in $vectorSearch `filter` (hard constraints are enforced as prefilters). */
export const VECTOR_FILTER_PATHS = [
  "status",
  "listingType",
  "financial.price",
  "facts.bedrooms",
  "facts.bathrooms",
  "facts.propertyType",
  "address.borough",
  "address.neighborhood",
] as const;

export interface VectorIndexDefinition {
  name: string;
  type: "vectorSearch";
  definition: {
    fields: (
      | { type: "vector"; path: string; numDimensions: number; similarity: "cosine" | "dotProduct" | "euclidean" }
      | { type: "filter"; path: string }
    )[];
  };
}

export const VECTOR_INDEXES: VectorIndexDefinition[] = [
  {
    name: EMBEDDING_INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "ai.embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
        ...VECTOR_FILTER_PATHS.map((path) => ({ type: "filter" as const, path })),
        { type: "filter", path: "ai.embeddingModel" },
      ],
    },
  },
  {
    name: FEATURE_INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "ai.featureVector", numDimensions: FEATURE_DIM, similarity: "cosine" },
        ...VECTOR_FILTER_PATHS.map((path) => ({ type: "filter" as const, path })),
      ],
    },
  },
];
