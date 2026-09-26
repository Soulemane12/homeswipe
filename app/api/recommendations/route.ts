import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json } from "@/lib/http/route";
import { isJudgeMode } from "@/lib/judge";
import { getRecommendations } from "@/services/recommendations/feed";

const Query = z.object({
  surface: z.enum(["discover", "swipe"]).default("discover"),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

/** GET /api/recommendations — a ranked feed page; each item's prediction is persisted first. */
export const GET = handle(async (request: Request) => {
  const q = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
  const feed = await getRecommendations(await getCurrentUserId(), { surface: q.surface, limit: q.limit, judge: await isJudgeMode() });
  return json(feed);
});
