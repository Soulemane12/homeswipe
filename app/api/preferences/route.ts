import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json } from "@/lib/http/route";
import { getHomeDna } from "@/services/preferences/dna";

/** GET /api/preferences — the user's Home DNA (learned + explicit preferences with confidence). */
export const GET = handle(async () => json(await getHomeDna(await getCurrentUserId())));
