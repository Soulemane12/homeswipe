import "server-only";
import { after } from "next/server";
import { runEvolution } from "@/services/harness/run-evolution";
import { updatePreferences } from "@/services/preferences/update";
import type { RecordResult } from "./record";

/**
 * Schedules batched learning after the response is sent: the preference update when enough
 * meaningful interactions accumulated, and automatic harness evolution (real data only).
 * Must be called from a request scope (route handler or server action).
 */
export function scheduleBackgroundLearning(userId: string, result: Pick<RecordResult, "preferenceUpdateDue" | "evolutionDue">): void {
  if (!result.preferenceUpdateDue && !result.evolutionDue) return;
  after(async () => {
    try {
      if (result.preferenceUpdateDue) await updatePreferences(userId);
      if (result.evolutionDue) await runEvolution(userId, { trigger: "auto", scope: "real" });
    } catch (error) {
      console.error("[learning] background update failed:", error);
    }
  });
}
