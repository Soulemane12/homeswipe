import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { isJudgeMode } from "@/lib/judge";
import { getRecommendations } from "@/services/recommendations/feed";

const Body = z.object({
  limit: z.number().int().min(1).max(12).default(5),
  excludeIds: z.array(z.string()).max(100).default([]),
  surface: z.enum(["discover", "swipe"]).default("swipe"),
});

/** POST /api/recommendations/next — next batch for swipe mode, excluding cards already queued. */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  const feed = await getRecommendations(await getCurrentUserId(), { surface: body.surface, limit: body.limit, excludeIds: body.excludeIds, judge: await isJudgeMode() });
  return json(feed);
});
