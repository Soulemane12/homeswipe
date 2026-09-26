import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { SearchRequestSchema, searchProperties } from "@/services/search/search";

/** POST /api/search/semantic — filters + natural-language query, personalized within constraints. */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, SearchRequestSchema);
  return json(await searchProperties(await getCurrentUserId(), body));
});
