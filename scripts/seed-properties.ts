import type { AnyBulkWriteOperation } from "mongodb";
import { embedTexts, propertyEmbeddingText } from "@/lib/embeddings/provider";
import { closeMongo } from "@/lib/mongodb/client";
import { db } from "@/lib/mongodb/collections";
import { ensureIndexes } from "@/lib/mongodb/indexes";
import { getPropertyProvider } from "@/lib/providers";
import { toPropertyDoc, type PropertyDoc } from "@/models/property";

/**
 * Loads listings from the configured provider (seed dataset by default) into MongoDB Atlas,
 * with Voyage (or OpenAI) embeddings when configured. Idempotent upserts by property id.
 */
async function main() {
  const provider = getPropertyProvider();
  const properties = await provider.search({ limit: 500 });
  console.log(`Provider "${provider.name}" returned ${properties.length} properties.`);

  let embeddings: { vectors: number[][]; model: string } | null = null;
  try {
    embeddings = await embedTexts(properties.map(propertyEmbeddingText), "document");
    if (embeddings) console.log(`Embedded ${embeddings.vectors.length} properties with ${embeddings.model}.`);
    else console.log("No embedding provider configured — using local feature vectors only (Vector Search runs on ai.featureVector).");
  } catch (error) {
    console.warn("Embedding failed; continuing with local feature vectors:", (error as Error).message);
  }

  const c = await db();
  const ops: AnyBulkWriteOperation<PropertyDoc>[] = properties.map((p, i) => {
    const doc = toPropertyDoc(embeddings ? { ...p, ai: { ...p.ai, embedding: embeddings.vectors[i], embeddingModel: embeddings.model } } : p);
    const { _id, ...rest } = doc;
    return { replaceOne: { filter: { _id }, replacement: { _id, ...rest }, upsert: true } };
  });
  const result = await c.properties.bulkWrite(ops, { ordered: false });
  console.log(`Upserted ${result.upsertedCount}, modified ${result.modifiedCount} properties.`);
  await ensureIndexes(c);
  console.log("Regular indexes ensured.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
