import "server-only";
import { ObjectId } from "mongodb";
import { HARNESS_CONFIG } from "@/lib/config/harness";
import { analyzeFailures } from "@/lib/engine/failure-analysis";
import { evolvePolicy } from "@/lib/engine/evolution";
import { replayPolicy, splitTrainHoldout } from "@/lib/engine/replay";
import { db } from "@/lib/mongodb/collections";
import type { DataScope, EvaluationRunDoc } from "@/models/harness";
import { invalidateCalibration } from "./calibration";
import { buildReplayDataset } from "./dataset";
import { narrateFailures } from "./analyze-failures";
import { getActivePolicy } from "./policies";
import { persistCandidatePolicy } from "./promote-policy";
import { proposeWithLlm } from "./propose-policy";
import { validateCandidate } from "./validate-policy";
import { updatePreferences } from "@/services/preferences/update";

export interface EvolutionRunSummary {
  status: "locked" | "insufficient_evidence" | "promoted" | "rejected";
  explanation: string;
  evaluationRunId?: string;
  newVersion?: number;
  activeVersion: number;
}

async function acquireLock(userId: string): Promise<boolean> {
  const c = await db();
  const now = new Date();
  const res = await c.users.findOneAndUpdate(
    { _id: userId, $or: [{ harnessLockUntil: { $exists: false } }, { harnessLockUntil: { $lt: now } }] },
    { $set: { harnessLockUntil: new Date(now.getTime() + HARNESS_CONFIG.lockMs) } },
  );
  return res !== null;
}

async function releaseLock(userId: string): Promise<void> {
  const c = await db();
  await c.users.updateOne({ _id: userId }, { $unset: { harnessLockUntil: "" } });
}

/**
 * One recursive-harness step for a user: gather evidence → evaluate → analyze failures →
 * propose (heuristic + optional LLM) → validate → backtest on holdout → promote or reject →
 * persist every experiment. Guarded by a lease lock so concurrent triggers cannot race.
 */
export async function runEvolution(userId: string, options: { trigger: "auto" | "manual"; scope: DataScope }): Promise<EvolutionRunSummary> {
  if (!(await acquireLock(userId))) {
    const active = await getActivePolicy(userId);
    return { status: "locked", explanation: "Another evolution run is in progress.", activeVersion: active.version };
  }
  const started = Date.now();
  try {
    const c = await db();
    const active = await getActivePolicy(userId);
    const { dataset, counts } = await buildReplayDataset(userId, options.scope);
    const config = { ...HARNESS_CONFIG };

    // Optional LLM proposals, grounded in the same quantitative training-split findings.
    let extraProposals: Awaited<ReturnType<typeof proposeWithLlm>> = [];
    if (dataset.examples.length >= config.minResolvedForEvolution) {
      const { training } = splitTrainHoldout(dataset.examples, { holdoutFraction: config.holdoutFraction, minHoldout: config.minHoldoutExamples });
      const trainRows = replayPolicy(dataset, active.policy, { examples: training, diagnostics: true });
      const report = analyzeFailures(trainRows, dataset, active.policy);
      extraProposals = (await proposeWithLlm(active.policy, report)).filter((p) => validateCandidate(active.policy, p.changes).ok);
    }

    const result = evolvePolicy({
      dataset,
      currentPolicy: active.policy,
      config,
      context: {
        saveCount: dataset.interactions.filter((i) => i.type === "save").length,
        positiveInteractionCount: dataset.interactions.filter((i) => ["like", "super_like", "save"].includes(i.type)).length,
      },
      extraProposals,
    });

    if (result.status === "insufficient_evidence" && options.trigger === "auto") {
      return { status: result.status, explanation: result.reason, activeVersion: active.version };
    }

    const narrative = result.failureReport ? await narrateFailures(result.failureReport) : undefined;
    const runId = new ObjectId();
    const run: EvaluationRunDoc = {
      _id: runId,
      userId,
      createdAt: new Date(),
      trigger: options.trigger,
      dataScope: options.scope,
      counts,
      currentPolicyVersion: active.version,
      candidatePolicyVersion: null,
      status: result.status,
      trainingRange: result.trainingRange,
      holdoutRange: result.holdoutRange,
      currentTrainingMetrics: result.currentTrainingMetrics,
      currentMetrics: result.currentHoldoutMetrics,
      candidateMetrics: result.candidateHoldoutMetrics,
      paired: result.paired,
      checks: result.decision?.checks,
      promoted: result.status === "promoted",
      explanation: result.reason,
      narrative,
      failureReport: result.failureReport,
      durationMs: 0,
    };

    const policyDoc = await persistCandidatePolicy({ userId, parentVersion: active.version, result, evaluationRunId: runId, dataScope: options.scope });
    run.candidatePolicyVersion = policyDoc?.version ?? null;
    run.durationMs = Date.now() - started;
    await c.evaluationRuns.insertOne(run);

    if (result.candidates.length > 0) {
      await c.harnessExperiments.insertOne({
        _id: new ObjectId(),
        userId,
        kind: "policy_backtest",
        createdAt: new Date(),
        updatedAt: new Date(),
        simulated: options.scope !== "real",
        evaluationRunId: runId,
        baseVersion: active.version,
        candidates: result.candidates,
        selectedCandidateId: result.selected?.id,
        llmProposalCount: extraProposals.length,
      });
    }
    await c.users.updateOne({ _id: userId }, { $set: { "counters.realResolvedSinceEvolution": 0 } });

    if (result.status === "promoted" && policyDoc) {
      const now = new Date();
      await c.preferenceMemories.updateOne(
        { userId, type: "experiment_learning", key: `harness_v${policyDoc.version}` },
        {
          $set: {
            statement: `Harness v${policyDoc.version}: ${result.selected!.label.toLowerCase()} — held-out accuracy ${(result.currentHoldoutMetrics!.accuracy * 100).toFixed(0)}% → ${(result.candidateHoldoutMetrics!.accuracy * 100).toFixed(0)}% (n=${result.candidateHoldoutMetrics!.n}).`,
            strength: result.candidateHoldoutMetrics!.accuracy - result.currentHoldoutMetrics!.accuracy,
            confidence: 1,
            evidenceCount: result.totalResolved,
            supportingPropertyIds: [],
            status: "active",
            includesSimulated: options.scope !== "real",
            updatedAt: now,
          },
          $setOnInsert: { _id: new ObjectId(), userId, type: "experiment_learning", key: `harness_v${policyDoc.version}`, createdAt: now },
        },
        { upsert: true },
      );
      invalidateCalibration();
      await updatePreferences(userId);
    }

    return {
      status: result.status,
      explanation: result.reason,
      evaluationRunId: runId.toHexString(),
      newVersion: policyDoc?.version,
      activeVersion: result.status === "promoted" && policyDoc ? policyDoc.version : active.version,
    };
  } finally {
    await releaseLock(userId);
  }
}
