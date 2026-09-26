import "server-only";
import { HARNESS_CONFIG } from "@/lib/config/harness";
import { fitPlatt, type Calibration } from "@/lib/engine/calibration";
import { db } from "@/lib/mongodb/collections";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; calibration: Calibration | null }>();

/**
 * Platt calibration for a policy version, fit on that version's resolved predictions (real or
 * simulated, never mixed). Until ≥30 outcomes exist this returns null and the UI shows only the
 * raw model score — it is never presented as a probability.
 */
export async function getCalibration(userId: string, version: number, simulated: boolean): Promise<Calibration | null> {
  const key = `${userId}:${version}:${simulated}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.calibration;
  const c = await db();
  const rows = await c.recommendationPredictions
    .find({ userId, policyVersion: version, simulated }, { projection: { predictedLikeScore: 1, actualLabel: 1 } })
    .toArray();
  const calibration = fitPlatt(
    rows.map((r) => ({ score: r.predictedLikeScore, liked: r.actualLabel === "LIKE" })),
    HARNESS_CONFIG.minResolvedForCalibration,
  );
  cache.set(key, { at: Date.now(), calibration });
  return calibration;
}

export function invalidateCalibration(): void {
  cache.clear();
}
