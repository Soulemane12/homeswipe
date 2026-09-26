import "server-only";
import { ObjectId } from "mongodb";
import type { EvolutionResult } from "@/lib/engine/evolution";
import { db } from "@/lib/mongodb/collections";
import type { DataScope, HarnessPolicyDoc } from "@/models/harness";
import { nextPolicyVersion } from "./policies";

export { decidePromotion } from "@/lib/engine/promotion";

/**
 * Persists the selected candidate as a new immutable policy version. Promoted candidates become
 * the single active policy (the previous one is retired, never mutated or deleted); rejected
 * candidates are kept with status "rejected" so the full experiment history is auditable.
 */
export async function persistCandidatePolicy(input: {
  userId: string;
  parentVersion: number;
  result: EvolutionResult;
  evaluationRunId: ObjectId;
  dataScope: DataScope;
}): Promise<HarnessPolicyDoc | null> {
  const { userId, result } = input;
  const selected = result.selected;
  if (!selected) return null;
  const c = await db();
  const version = await nextPolicyVersion(userId);
  const promoted = result.status === "promoted";
  const now = new Date();
  const doc: HarnessPolicyDoc = {
    _id: new ObjectId(),
    userId,
    version,
    parentVersion: input.parentVersion,
    status: promoted ? "active" : "rejected",
    createdAt: now,
    createdBy: selected.source === "llm" ? "harness+llm" : "harness",
    reason: `${selected.label}. ${result.reason}`,
    evidence: (result.failureReport?.findings ?? []).slice(0, 5).map((f) => f.summary),
    changes: selected.changes,
    diff: selected.diff,
    policy: selected.policy,
    evaluationSummary: {
      evaluationRunId: input.evaluationRunId,
      dataScope: input.dataScope,
      holdoutAccuracy: result.candidateHoldoutMetrics?.accuracy ?? 0,
      parentHoldoutAccuracy: result.currentHoldoutMetrics?.accuracy ?? 0,
      holdoutN: result.candidateHoldoutMetrics?.n ?? 0,
    },
    dataScope: input.dataScope,
    activatedAt: promoted ? now : undefined,
  };

  if (!promoted) {
    await c.harnessPolicies.insertOne(doc);
    return doc;
  }
  await c.harnessPolicies.updateOne({ userId, status: "active" }, { $set: { status: "retired", retiredAt: now } });
  try {
    await c.harnessPolicies.insertOne(doc);
  } catch (error) {
    await c.harnessPolicies.updateOne({ userId, version: input.parentVersion }, { $set: { status: "active" }, $unset: { retiredAt: "" } });
    throw error;
  }
  await c.users.updateOne({ _id: userId }, { $set: { activePolicyVersion: version, updatedAt: now } });
  return doc;
}
