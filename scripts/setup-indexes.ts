import { closeMongo } from "@/lib/mongodb/client";
import { ensureIndexes, ensureVectorIndexes, waitForVectorIndexes } from "@/lib/mongodb/indexes";

/**
 * Creates regular indexes and the Atlas Vector Search indexes, then waits (polling
 * listSearchIndexes) until the vector indexes are queryable. On timeout the app still works via
 * its in-app cosine fallback; see docs/mongodb.md to create the indexes manually.
 */
async function main() {
  await ensureIndexes();
  console.log("Regular indexes ensured.");
  try {
    const { created, updated } = await ensureVectorIndexes();
    console.log(`Vector Search indexes — created: [${created.join(", ")}], updated: [${updated.join(", ")}].`);
  } catch (error) {
    console.warn("Could not create Vector Search indexes from code:", (error as Error).message);
    console.warn("Create them in the Atlas UI using the definitions in docs/mongodb.md. The app falls back to in-app cosine until then.");
    return;
  }
  const timeoutMs = Number(process.env.VECTOR_INDEX_TIMEOUT_MS ?? 300_000);
  console.log(`Waiting up to ${Math.round(timeoutMs / 1000)}s for indexes to become queryable…`);
  const { ready, statuses } = await waitForVectorIndexes({
    timeoutMs,
    intervalMs: 5000,
    onPoll: (s) => console.log(`  ${s.map((x) => `${x.name}: ${x.status}${x.queryable ? " (queryable)" : ""}`).join(" | ")}`),
  });
  if (ready) console.log("Vector Search indexes are queryable.");
  else console.warn(`Timed out waiting for Vector Search (${statuses.map((s) => `${s.name}=${s.status}`).join(", ")}). The app will use in-app cosine until they are ready.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
