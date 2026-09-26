import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env, requireMongoUri } from "@/lib/env";

declare global {
  var __swipehomeMongo: Promise<MongoClient> | undefined;
}

/**
 * One MongoClient per process. The promise is cached on globalThis so Next.js dev-mode hot
 * reloads and warm serverless instances reuse the same connection pool.
 */
export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__swipehomeMongo) {
    // ignoreUndefined: optional fields are omitted instead of being stored as null, so documents
    // match their TypeScript types (e.g. a missing dwellMs is never read back as null).
    const client = new MongoClient(requireMongoUri(), { appName: "swipehome", maxPoolSize: 10, ignoreUndefined: true });
    globalThis.__swipehomeMongo = client.connect().catch((error: unknown) => {
      globalThis.__swipehomeMongo = undefined;
      throw error;
    });
  }
  return globalThis.__swipehomeMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env().MONGODB_DB_NAME);
}

/** For scripts: close the shared client so the process can exit. */
export async function closeMongo(): Promise<void> {
  if (globalThis.__swipehomeMongo) {
    const client = await globalThis.__swipehomeMongo;
    await client.close();
    globalThis.__swipehomeMongo = undefined;
  }
}
