import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { createSavedSearch, listSavedSearches } from "@/services/search/saved-searches";
import { SearchFiltersSchema } from "@/services/search/search";

export const GET = handle(async () => {
  const searches = await listSavedSearches(await getCurrentUserId());
  return json({ searches: searches.map((s) => ({ ...s, _id: undefined, id: s._id.toHexString() })) });
});

const Body = z.object({ name: z.string().trim().min(1).max(80), filters: SearchFiltersSchema.default({}), query: z.string().max(300).optional(), minMatch: z.number().int().min(50).max(99).optional() });

export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  const doc = await createSavedSearch(await getCurrentUserId(), body);
  return json({ id: doc._id.toHexString() });
});
