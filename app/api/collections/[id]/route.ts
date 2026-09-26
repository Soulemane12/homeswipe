import { ObjectId } from "mongodb";
import { getCurrentUserId } from "@/lib/auth/session";
import { errorResponse, handle, json } from "@/lib/http/route";
import { deleteCollection } from "@/services/collections";

export const DELETE = handle(async (_request: Request, ctx: RouteContext<"/api/collections/[id]">) => {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return errorResponse(400, "Invalid collection id");
  await deleteCollection(await getCurrentUserId(), new ObjectId(id));
  return json({ ok: true });
});
