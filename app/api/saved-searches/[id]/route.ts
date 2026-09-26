import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { errorResponse, handle, json, parseBody } from "@/lib/http/route";
import { deleteSavedSearch, setSavedSearchAlert } from "@/services/search/saved-searches";

export const DELETE = handle(async (_request: Request, ctx: RouteContext<"/api/saved-searches/[id]">) => {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid id");
  await deleteSavedSearch(await getCurrentUserId(), new ObjectId(id));
  return json({ ok: true });
});

const Body = z.object({ alert: z.object({ enabled: z.boolean(), minMatch: z.number().int().min(50).max(99) }) });

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/saved-searches/[id]">) => {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid id");
  const body = await parseBody(request, Body);
  await setSavedSearchAlert(await getCurrentUserId(), new ObjectId(id), body.alert);
  return json({ ok: true });
});
