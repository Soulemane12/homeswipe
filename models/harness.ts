import type { ObjectId } from "mongodb";
import type { Calibration } from "@/lib/engine/calibration";
import type { EvaluatedCandidate, DataRange } from "@/lib/engine/evolution";
import type { FailureReport } from "@/lib/engine/failure-analysis";
import type { Metrics } from "@/lib/engine/metrics";
import type { PolicyChange } from "@/lib/engine/policy-patch";
import type { PolicyDiffEntry } from "@/lib/engine/policy-diff";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import type { PromotionCheck } from "@/lib/engine/promotion";

export type DataScope = "real" | "simulated" | "combined";
export const DATA_SCOPES: readonly DataScope[] = ["real", "simulated", "combined"];

export interface HarnessPolicyDoc {
  _id: ObjectId;
  userId: string;
  version: number;
  parentVersion: number | null;
  status: "active" | "retired" | "rejected" | "candidate";
  createdAt: Date;
  createdBy: "seed" | "harness" | "harness+llm";
  reason: string;
  evidence: string[];
  changes: (PolicyChange & { backtestable: boolean })[];
  diff: PolicyDiffEntry[];
  policy: HarnessPolicy;
  evaluationSummary?: {
    evaluationRunId: ObjectId;
    dataScope: DataScope;
    holdoutAccuracy: number;
    parentHoldoutAccuracy: number;
    holdoutN: number;
  };
  dataScope?: DataScope;
  activatedAt?: Date;
  retiredAt?: Date;
}

export interface EvaluationRunDoc {
  _id: ObjectId;
  userId: string;
  createdAt: Date;
  trigger: "auto" | "manual";
  dataScope: DataScope;
  counts: { real: number; simulated: number };
  currentPolicyVersion: number;
  candidatePolicyVersion: number | null;
  status: "insufficient_evidence" | "promoted" | "rejected";
  trainingRange?: DataRange;
  holdoutRange?: DataRange;
  currentTrainingMetrics?: Metrics;
  currentMetrics?: Metrics;
  candidateMetrics?: Metrics;
  paired?: { candidateOnlyCorrect: number; currentOnlyCorrect: number };
  checks?: PromotionCheck[];
  promoted: boolean;
  explanation: string;
  narrative?: string;
  failureReport?: FailureReport;
  durationMs: number;
}

export interface HarnessExperimentDoc {
  _id: ObjectId;
  userId: string;
  kind: "policy_backtest" | "exploration_probe";
  createdAt: Date;
  updatedAt: Date;
  simulated: boolean;
  // policy_backtest
  evaluationRunId?: ObjectId;
  baseVersion?: number;
  candidates?: EvaluatedCandidate[];
  selectedCandidateId?: string;
  llmProposalCount?: number;
  // exploration_probe
  impressionId?: ObjectId;
  propertyId?: string;
  targetDimension?: string;
  propertyValue?: number;
  confidenceBefore?: number;
  confidenceAfter?: number;
  outcome?: "LIKE" | "DISLIKE";
  status?: "pending" | "resolved" | "measured";
}

export interface CalibrationCache {
  version: number;
  calibration: Calibration | null;
  computedAt: number;
}
