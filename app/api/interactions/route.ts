import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { isJudgeMode } from "@/lib/judge";
import { InteractionInputSchema } from "@/models/interaction";
import { scheduleBackgroundLearning } from "@/services/interactions/learning";
import { recordInteraction } from "@/services/interactions/record";

export const maxDuration = 60;

/**
 * POST /api/interactions — records an interaction and resolves its prediction. Preference
 * updates and automatic harness evolution run after the response (batched, never per swipe).
 */
export const POST = handle(async (request: Request) => {
  const userId = await getCurrentUserId();
  const input = await parseBody(request, InteractionInputSchema);
  const result = await recordInteraction(userId, input);
  scheduleBackgroundLearning(userId, result);
  const judge = await isJudgeMode();
  return json({
    interactionId: result.interactionId,
    preferencesUpdating: result.preferenceUpdateDue,
    resolved: judge ? result.resolved : undefined,
  });
});
