import "server-only";
import { z } from "zod";

const optionalString = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional());
const booleanFlag = (fallback: boolean) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : fallback), z.boolean());

const EnvSchema = z.object({
  MONGODB_URI: optionalString,
  MONGODB_DB_NAME: z.preprocess((v) => (v === "" || v === undefined ? "homeswipe" : v), z.string()),
  VOYAGE_API_KEY: optionalString,
  VOYAGE_MODEL: z.preprocess((v) => (v === "" || v === undefined ? "voyage-4" : v), z.string()),
  OPENAI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  LLM_MODEL: optionalString,
  OPENAI_EMBEDDING_MODEL: z.preprocess((v) => (v === "" || v === undefined ? "text-embedding-3-small" : v), z.string()),
  PROPERTY_PROVIDER: z.preprocess((v) => (v === "" || v === undefined ? "seed" : v), z.enum(["seed", "rentcast"])),
  RENTCAST_API_KEY: optionalString,
  NEXT_PUBLIC_APP_URL: optionalString,
  NEXT_PUBLIC_MAPBOX_TOKEN: optionalString,
  DEMO_MODE: booleanFlag(false),
  HARNESS_AUTO_EVOLVE: booleanFlag(true),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Server-side environment, validated once. Never import this from client components. */
export function env(): Env {
  if (!cached) cached = EnvSchema.parse(process.env);
  return cached;
}

export function requireMongoUri(): string {
  const uri = env().MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env.local (see .env.example).");
  }
  return uri;
}

/** Destructive demo tooling (reset, simulation) is only available in demo mode or local development. */
export function demoToolsEnabled(): boolean {
  const e = env();
  return e.DEMO_MODE || e.NODE_ENV === "development";
}

export function featureFlags() {
  const e = env();
  return {
    voyage: Boolean(e.VOYAGE_API_KEY),
    openaiEmbeddings: Boolean(e.OPENAI_API_KEY),
    llm: Boolean(e.OPENAI_API_KEY || e.OPENROUTER_API_KEY),
    mapbox: Boolean(e.NEXT_PUBLIC_MAPBOX_TOKEN),
    rentcast: Boolean(e.RENTCAST_API_KEY),
    demoTools: demoToolsEnabled(),
  };
}
