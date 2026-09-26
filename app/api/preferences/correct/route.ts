import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { CorrectionSchema, SOURCE_SURFACES } from "@/models/interaction";
import { applyCorrection } from "@/services/preferences/corrections";

const Body = z.object({
  corrections: z.array(CorrectionSchema).min(1).max(10),
  propertyId: z.string().optional(),
  because: z.array(z.string()).max(10).optional(),
  notBecauseOf: z.array(z.string()).max(10).optional(),
  text: z.string().max(500).optional(),
  sourceSurface: z.enum(SOURCE_SURFACES).default("home_dna"),
});

/** POST /api/preferences/correct — explicit, high-confidence preference correction (applied immediately). */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  const result = await applyCorrection(await getCurrentUserId(), body);
  return json({ ok: true, summary: result.summary });
});
