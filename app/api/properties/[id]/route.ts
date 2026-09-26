import { getCurrentUserId } from "@/lib/auth/session";
import { errorResponse, handle, json } from "@/lib/http/route";
import { getPropertyDetail } from "@/services/properties/detail";

export const GET = handle(async (_request: Request, ctx: RouteContext<"/api/properties/[id]">) => {
  const { id } = await ctx.params;
  const detail = await getPropertyDetail(await getCurrentUserId(), id);
  if (!detail) return errorResponse(404, "Property not found");
  return json(detail);
});
