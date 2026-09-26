import { toVectorSearchFilter } from "@/lib/engine/constraints";
import { closeMongo, getDb } from "@/lib/mongodb/client";
import { COLLECTION_NAMES, db } from "@/lib/mongodb/collections";
import { listVectorIndexStatus } from "@/lib/mongodb/indexes";
import { FEATURE_INDEX_NAME } from "@/lib/mongodb/vector-indexes";
import { localPreferenceVector } from "@/lib/embeddings/local";
import { DEMO_USER_ID } from "@/models/user";
import { loadCatalog } from "@/services/properties/repository";
import { vectorSearch } from "@/services/search/vector";

/**
 * Verification script: connection, collections + counts, indexes, and a raw `$vectorSearch`
 * plus the app's vectorSearch() path (which must report atlas_vector_search, not fallback).
 */
async function main() {
  const database = await getDb();
  await database.command({ ping: 1 });
  console.log(`connection: OK (db "${database.databaseName}")`);

  const existing = new Set((await database.listCollections().toArray()).map((c) => c.name));
  for (const name of Object.values(COLLECTION_NAMES)) {
    const count = existing.has(name) ? await database.collection(name).countDocuments() : null;
    console.log(`  ${name.padEnd(28)} ${count === null ? "(not created yet)" : count}`);
  }

  const c = await db();
  const propIdx = await c.properties.indexes();
  console.log(`properties indexes: ${propIdx.map((i) => i.name).join(", ")}`);
  const policyIdx = await c.harnessPolicies.indexes();
  console.log(`harness_policies indexes: ${policyIdx.map((i) => i.name).join(", ")}`);
  console.log(`vector indexes: ${(await listVectorIndexStatus()).map((s) => `${s.name}=${s.status}${s.queryable ? "(queryable)" : ""}`).join(", ")}`);

  const policies = await c.harnessPolicies.find({ userId: DEMO_USER_ID }).project({ version: 1, status: 1 }).toArray();
  console.log(`demo user policies: ${policies.map((p) => `v${p.version}:${p.status}`).join(", ")}`);

  const query = localPreferenceVector({ natural_light: 1, modern_interior: 1, near_transit: 1, carpet: -1 });
  const raw = await c.properties
    .aggregate<{ _id: string; headline: string; score: number }>([
      {
        $vectorSearch: {
          index: FEATURE_INDEX_NAME,
          path: "ai.featureVector",
          queryVector: query,
          numCandidates: 150,
          limit: 5,
          filter: toVectorSearchFilter({ listingType: "sale", maxPrice: 1_500_000, minBedrooms: 1, minBathrooms: 0, propertyTypes: [], boroughs: [], neighborhoods: [] }),
        },
      },
      { $project: { headline: 1, score: { $meta: "vectorSearchScore" } } },
    ])
    .toArray();
  console.log(`raw $vectorSearch (≤$1.5M, 1+ bed, bright/modern/transit, no carpet): ${raw.length} hits`);
  for (const r of raw) console.log(`  ${r.score.toFixed(3)}  ${r._id}  ${r.headline}`);

  const catalog = await loadCatalog();
  const res = await vectorSearch({ space: "feature", vector: query, constraints: { listingType: "sale", minBedrooms: 0, minBathrooms: 0, propertyTypes: [], boroughs: [], neighborhoods: [] }, limit: 5, catalog });
  console.log(`app vectorSearch(): mode=${res.mode}, hits=${res.hits.length}`);
  if (res.mode !== "atlas_vector_search") process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(String(error?.message ?? error).replace(/mongodb(\+srv)?:\/\/[^@\s]+@/g, "mongodb$1://<redacted>@"));
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
