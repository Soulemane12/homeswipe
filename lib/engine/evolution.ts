import { analyzeFailures, type FailureReport } from "./failure-analysis";
import { computeMetrics, type Metrics, type OutcomeRow } from "./metrics";
import { applyChanges, isBacktestablePath, type PolicyChange } from "./policy-patch";
import { diffPolicies, type PolicyDiffEntry } from "./policy-diff";
import type { HarnessPolicy } from "./policy-schema";
import { decidePromotion, pairedOutcome, type PairedOutcome, type PromotionConfig, type PromotionDecision } from "./promotion";
import { perturbations, proposeCandidates, type CandidateProposal, type ProposalContext } from "./proposals";
import { replayPolicy, splitTrainHoldout, type ReplayDataset, type ReplayExample, type ReplayRow } from "./replay";

export interface EvolutionConfig extends PromotionConfig {
  holdoutFraction: number;
}

export interface EvaluatedCandidate {
  id: string;
  label: string;
  source: CandidateProposal["source"];
  changes: (PolicyChange & { backtestable: boolean })[];
  valid: boolean;
  errors?: string[];
  trainingMetrics?: Metrics;
  objective?: number;
}

export interface DataRange {
  from: Date;
  to: Date;
  n: number;
}

export interface EvolutionResult {
  status: "insufficient_evidence" | "promoted" | "rejected";
  reason: string;
  totalResolved: number;
  trainingRange?: DataRange;
  holdoutRange?: DataRange;
  currentTrainingMetrics?: Metrics;
  failureReport?: FailureReport;
  candidates: EvaluatedCandidate[];
  selected?: EvaluatedCandidate & { policy: HarnessPolicy; diff: PolicyDiffEntry[] };
  currentHoldoutMetrics?: Metrics;
  candidateHoldoutMetrics?: Metrics;
  paired?: PairedOutcome;
  decision?: PromotionDecision;
}

function thresholdObjective(m: Metrics): number {
  return (m.accuracy + m.balancedAccuracy) / 2;
}

/**
 * Candidate selection objective: ranking quality (AUC) of the fit score, with a small
 * accuracy tie-breaker. AUC is threshold-free and far less noisy than accuracy on a few
 * dozen examples, so it picks component/memory changes by real discriminative power.
 */
function selectionObjective(m: Metrics): number {
  return m.auc + 0.1 * thresholdObjective(m);
}

/** The most recent share of training rows — closest in time to the holdout. */
function recentRows<T>(rows: T[]): T[] {
  return rows.slice(Math.max(0, rows.length - Math.max(10, Math.ceil(rows.length * 0.6))));
}

function range(examples: ReplayExample[]): DataRange {
  return { from: examples[0].shownAt, to: examples[examples.length - 1].shownAt, n: examples.length };
}

/** Re-labels replay rows under a different like threshold (fit ≥ threshold ⇔ LIKE). */
function withThreshold(rows: ReplayRow[], threshold: number): OutcomeRow[] {
  return rows.map((r) => ({ ...r, predicted: r.breakdown.fit >= threshold ? "LIKE" : "DISLIKE" }));
}

/** Largest threshold move allowed in a single evolution step (trust region). */
export const MAX_THRESHOLD_STEP = 0.06;

/**
 * Threshold that maximizes (accuracy + balanced accuracy) / 2 on the most recent 60% of the
 * training rows (closest in time to what comes next), within a trust region around the
 * current threshold so one noisy window cannot swing predictions wildly.
 */
export function fitThreshold(allRows: ReplayRow[], current: number): number {
  const rows = recentRows(allRows);
  let best = current;
  let bestValue = -Infinity;
  const lo = Math.max(0.3, current - MAX_THRESHOLD_STEP);
  const hi = Math.min(0.7, current + MAX_THRESHOLD_STEP);
  for (let t = lo; t <= hi + 1e-9; t += 0.005) {
    const value = thresholdObjective(computeMetrics(withThreshold(rows, t)));
    const better = value > bestValue + 1e-9 || (Math.abs(value - bestValue) <= 1e-9 && Math.abs(t - current) < Math.abs(best - current));
    if (better) {
      bestValue = value;
      best = Math.round(t * 1000) / 1000;
    }
  }
  return best;
}

interface TrainingEval {
  policy: HarnessPolicy;
  changes: PolicyChange[];
  metrics: Metrics;
  objective: number;
}

function evaluateOnTraining(
  dataset: ReplayDataset,
  training: ReplayExample[],
  base: HarnessPolicy,
  changes: PolicyChange[],
): { ok: true; result: TrainingEval } | { ok: false; errors: string[] } {
  const applied = applyChanges(base, changes);
  if (!applied.ok) return { ok: false, errors: applied.errors };
  const rows = replayPolicy(dataset, applied.policy, { examples: training });
  const threshold = fitThreshold(rows, applied.policy.prediction.threshold);
  const allChanges = [...changes];
  let policy = applied.policy;
  if (Math.abs(threshold - applied.policy.prediction.threshold) >= 0.0005) {
    const m = computeMetrics(withThreshold(rows, threshold));
    const thresholdChange: PolicyChange = {
      path: "prediction.threshold",
      op: "set",
      value: threshold,
      evidence: `Refit on training replay: predicted-positive rate ${(m.predictedPositiveRate * 100).toFixed(0)}% vs like rate ${(m.likeRate * 100).toFixed(0)}%.`,
      expectedEffect: "LIKE/DISLIKE predictions match how often this user actually likes homes.",
    };
    const reapplied = applyChanges(policy, [thresholdChange]);
    if (reapplied.ok) {
      policy = reapplied.policy;
      allChanges.push(thresholdChange);
    }
  }
  const metrics = computeMetrics(withThreshold(recentRows(rows), policy.prediction.threshold));
  return { ok: true, result: { policy, changes: allChanges, metrics, objective: selectionObjective(metrics) } };
}

/**
 * One full harness evolution step, entirely offline and deterministic:
 * split → replay current on training → analyze failures → propose bounded candidates →
 * pick the best on training (plus a local search step) → attach evidence-justified retrieval
 * changes → compare against the current policy on the untouched holdout → promotion gate.
 */
export function evolvePolicy(input: {
  dataset: ReplayDataset;
  currentPolicy: HarnessPolicy;
  config: EvolutionConfig;
  context: ProposalContext;
  extraProposals?: CandidateProposal[];
}): EvolutionResult {
  const { currentPolicy, config } = input;
  const dataset: ReplayDataset = { ...input.dataset, fitCache: input.dataset.fitCache ?? new Map() };
  const examples = dataset.examples;
  const totalResolved = examples.length;
  if (totalResolved < config.minResolvedForEvolution) {
    return {
      status: "insufficient_evidence",
      reason: `Need at least ${config.minResolvedForEvolution} resolved predictions; have ${totalResolved}.`,
      totalResolved,
      candidates: [],
    };
  }
  const { training, holdout } = splitTrainHoldout(examples, {
    holdoutFraction: config.holdoutFraction,
    minHoldout: config.minHoldoutExamples,
  });
  if (holdout.length < config.minHoldoutExamples || training.length < 10) {
    return {
      status: "insufficient_evidence",
      reason: `Need ≥${config.minHoldoutExamples} holdout and ≥10 training examples; have ${holdout.length} and ${training.length}.`,
      totalResolved,
      candidates: [],
    };
  }

  const currentTrainRows = replayPolicy(dataset, currentPolicy, { examples: training, diagnostics: true });
  const currentTrainingMetrics = computeMetrics(currentTrainRows);
  const failureReport = analyzeFailures(currentTrainRows, dataset, currentPolicy);
  const { candidates: proposals, retrieval } = proposeCandidates(currentPolicy, failureReport, input.context);
  const allProposals: CandidateProposal[] = [
    { id: "threshold-only", label: "Recalibrate the like threshold", source: "heuristic", changes: [] },
    ...proposals,
    ...(input.extraProposals ?? []),
  ];

  const evaluated: EvaluatedCandidate[] = [];
  let best: (TrainingEval & { proposal: CandidateProposal }) | null = null;
  for (const proposal of allProposals) {
    const outcome = evaluateOnTraining(dataset, training, currentPolicy, proposal.changes);
    if (!outcome.ok) {
      evaluated.push({ ...describe(proposal, proposal.changes), valid: false, errors: outcome.errors });
      continue;
    }
    evaluated.push({ ...describe(proposal, outcome.result.changes), valid: true, trainingMetrics: outcome.result.metrics, objective: outcome.result.objective });
    if (!best || outcome.result.objective > best.objective + 1e-9) best = { ...outcome.result, proposal };
  }

  // One round of local search around the best training candidate.
  if (best) {
    for (const proposal of perturbations(best.policy, failureReport)) {
      const outcome = evaluateOnTraining(dataset, training, best.policy, proposal.changes);
      if (!outcome.ok) {
        evaluated.push({ ...describe(proposal, proposal.changes), valid: false, errors: outcome.errors });
        continue;
      }
      evaluated.push({ ...describe(proposal, outcome.result.changes), valid: true, trainingMetrics: outcome.result.metrics, objective: outcome.result.objective });
      if (outcome.result.objective > best.objective + 0.005) {
        best = {
          ...outcome.result,
          changes: [...best.changes, ...outcome.result.changes],
          proposal: { ...proposal, label: `${best.proposal.label} (fine-tuned)` },
        };
      }
    }
  }

  const base: EvolutionResult = {
    status: "rejected",
    reason: "No valid candidate policy could be generated.",
    totalResolved,
    trainingRange: range(training),
    holdoutRange: range(holdout),
    currentTrainingMetrics,
    failureReport,
    candidates: evaluated,
  };
  if (!best) return base;

  // Evidence-justified retrieval/exploration changes ride along; they are flagged as not backtested.
  let finalPolicy = best.policy;
  let finalChanges = dedupeSets(best.changes);
  if (retrieval.length > 0) {
    const withRetrieval = applyChanges(best.policy, retrieval);
    if (withRetrieval.ok) {
      finalPolicy = withRetrieval.policy;
      finalChanges = dedupeSets([...finalChanges, ...retrieval]);
    }
  }

  const currentHoldRows = replayPolicy(dataset, currentPolicy, { examples: holdout });
  const candidateHoldRows = replayPolicy(dataset, finalPolicy, { examples: holdout });
  const currentHoldoutMetrics = computeMetrics(currentHoldRows);
  const candidateHoldoutMetrics = computeMetrics(candidateHoldRows);
  const paired = pairedOutcome(currentHoldRows, candidateHoldRows);
  const decision = decidePromotion({
    totalResolved,
    current: currentHoldoutMetrics,
    candidate: candidateHoldoutMetrics,
    paired,
    config,
  });

  return {
    ...base,
    status: decision.promote ? "promoted" : "rejected",
    reason: decision.reason,
    selected: {
      ...describe(best.proposal, finalChanges),
      valid: true,
      trainingMetrics: best.metrics,
      objective: best.objective,
      policy: finalPolicy,
      diff: diffPolicies(currentPolicy, finalPolicy),
    },
    currentHoldoutMetrics,
    candidateHoldoutMetrics,
    paired,
    decision,
  };
}

function describe(proposal: CandidateProposal, changes: PolicyChange[]): Omit<EvaluatedCandidate, "valid"> {
  return {
    id: proposal.id,
    label: proposal.label,
    source: proposal.source,
    changes: changes.map((c) => ({ ...c, backtestable: isBacktestablePath(c.path) })),
  };
}

/** Keeps only the last "set" per path so the reasoning trail matches the final policy. */
function dedupeSets(changes: PolicyChange[]): PolicyChange[] {
  const lastSet = new Map<string, number>();
  changes.forEach((c, i) => {
    if (c.op === "set") lastSet.set(c.path, i);
  });
  return changes.filter((c, i) => c.op !== "set" || lastSet.get(c.path) === i);
}
