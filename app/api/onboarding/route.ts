import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { ExplicitPreferencesSchema, HardConstraintsSchema } from "@/models/user";
import { updatePreferences } from "@/services/preferences/update";
import { saveOnboarding } from "@/services/users";

const Body = z.object({ constraints: HardConstraintsSchema, explicit: ExplicitPreferencesSchema });

/** POST /api/onboarding — hard constraints + optional explicit preferences. */
export const POST = handle(async (request: Request) => {
  const userId = await getCurrentUserId();
  const body = await parseBody(request, Body);
  await saveOnboarding(userId, body);
  await updatePreferences(userId);
  return json({ ok: true });
});
