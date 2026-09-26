import "server-only";
import { env } from "@/lib/env";
import { EMBEDDING_DIMENSIONS } from "@/lib/mongodb/vector-indexes";
import type { Property } from "@/models/property";
import { localPropertyVector, localTextVector } from "./local";
import { openaiEmbed } from "./openai";
import { voyageEmbed } from "./voyage";

export interface EmbeddingResult {
  vector: number[];
  /** Model id stored alongside vectors (e.g. "voyage-4"); "local-feature" for the fallback. */
  model: string;
  space: "embedding" | "local";
}

export const LOCAL_MODEL = "local-feature";
const BATCH_SIZE = 64;

/** The configured embedding model id, or null when only the local fallback is available. */
export function activeEmbeddingModel(): string | null {
  const e = env();
  if (e.VOYAGE_API_KEY) return e.VOYAGE_MODEL;
  if (e.OPENAI_API_KEY) return `openai/${e.OPENAI_EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;
  return null;
}

/** Embeds texts with the configured provider; returns null when no provider is configured. */
export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<{ vectors: number[][]; model: string } | null> {
  const e = env();
  const model = activeEmbeddingModel();
  if (!model || texts.length === 0) return null;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const out = e.VOYAGE_API_KEY
      ? await voyageEmbed({ apiKey: e.VOYAGE_API_KEY, model: e.VOYAGE_MODEL, texts: batch, inputType, dimensions: EMBEDDING_DIMENSIONS })
      : await openaiEmbed({ apiKey: e.OPENAI_API_KEY!, model: e.OPENAI_EMBEDDING_MODEL, texts: batch, dimensions: EMBEDDING_DIMENSIONS });
    vectors.push(...out);
  }
  return { vectors, model };
}

export async function embedText(text: string, inputType: "document" | "query" = "query"): Promise<EmbeddingResult> {
  try {
    const result = await embedTexts([text], inputType);
    if (result) return { vector: result.vectors[0], model: result.model, space: "embedding" };
  } catch (error) {
    console.error("[embeddings] provider failed, using local fallback:", (error as Error).message);
  }
  return { vector: localTextVector(text), model: LOCAL_MODEL, space: "local" };
}

export function propertyEmbeddingText(p: Pick<Property, "headline" | "ai" | "description">): string {
  return `${p.headline}. ${p.ai.semanticDescription} ${p.description}`;
}

export async function embedProperty(p: Property): Promise<EmbeddingResult> {
  try {
    const result = await embedTexts([propertyEmbeddingText(p)], "document");
    if (result) return { vector: result.vectors[0], model: result.model, space: "embedding" };
  } catch (error) {
    console.error("[embeddings] property embedding failed, using local vector:", (error as Error).message);
  }
  return { vector: localPropertyVector(p.ai.features), model: LOCAL_MODEL, space: "local" };
}

/** Embeds the natural-language preference summary used as the Vector Search query. */
export async function embedUserPreference(summary: string): Promise<EmbeddingResult> {
  return embedText(summary, "query");
}
