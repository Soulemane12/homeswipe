import { writeFileSync } from "node:fs";
import path from "node:path";
import { generateSeedProperties } from "@/lib/seed/generate";
import { PropertySchema } from "@/models/property";

/** Regenerates data/seed-properties.json deterministically from lib/seed/generate.ts. */
const properties = generateSeedProperties();
for (const p of properties) PropertySchema.parse(p);
const file = path.join(process.cwd(), "data", "seed-properties.json");
writeFileSync(file, `${JSON.stringify(properties, null, 1)}\n`);
console.log(`Wrote ${properties.length} properties to ${path.relative(process.cwd(), file)}`);
