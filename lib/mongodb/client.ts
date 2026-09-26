import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env, requireMongoUri } from "@/lib/env";

declare global {
  var __homeswipeMongo: Promise<MongoClient> | undefined;
}

/**
 * One MongoClient per process. The promise is cached on globalThis so Next.js dev-mode hot
 * reloads and warm serverless instances reuse the same connection pool.
 */
export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__homeswipeMongo) {
    // ignoreUndefined: optional fields are omitted instead of being stored as null, so documents
    // match their TypeScript types (e.g. a missing dwellMs is never read back as null).
    const client = new MongoClient(requireMongoUri(), { appName: "homeswipe", maxPoolSize: 10, ignoreUndefined: true });
    globalThis.__homeswipeMongo = client.connect().catch((error: unknown) => {
      globalThis.__homeswipeMongo = undefined;
      throw error;
    });
  }
  return globalThis.__homeswipeMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env().MONGODB_DB_NAME);
}

/** For scripts: close the shared client so the process can exit. */
export async function closeMongo(): Promise<void> {
  if (globalThis.__homeswipeMongo) {
    const client = await globalThis.__homeswipeMongo;
    await client.close();
    globalThis.__homeswipeMongo = undefined;
  }
}
