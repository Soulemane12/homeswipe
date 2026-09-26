import { dimensionLabel } from "@/lib/features/dimensions";
import type { FailureFinding, FailureReport } from "./failure-analysis";
import type { PolicyChange } from "./policy-patch";
import type { HarnessPolicy } from "./policy-schema";
import { PREDICTIVE_COMPONENTS, type PredictiveComponent } from "./types";

export interface CandidateProposal {
  id: string;
  label: string;
  source: "heuristic" | "search" | "llm";
  changes: PolicyChange[];
}

export interface ProposalContext {
  saveCount: number;
  positiveInteractionCount: number;
}

function change(path: string, op: PolicyChange["op"], value: PolicyChange["value"], evidence: string, expectedEffect: string): PolicyChange {
  return { path, op, value, evidence, expectedEffect };
}

function bestComponent(report: FailureReport, exclude?: PredictiveComponent): PredictiveComponent {
  return [...PREDICTIVE_COMPONENTS]
    .filter((c) => c !== exclude)
    .sort((a, b) => report.componentCorrelation[b] - report.componentCorrelation[a])[0];
}

function proposalsForFinding(f: FailureFinding, policy: HarnessPolicy, report: FailureReport): CandidateProposal[] {
  const w = policy.rankingWeights;
  const mp = policy.memoryPolicy;
  switch (f.category) {
    case "overweighted_component": {
      const c = f.component!;
      const target = bestComponent(report, c);
      return [0.5, 0.25].map((keep) => ({
        id: `shift-${c}-${target}-${keep}`,
        label: `Shift weight from ${c} to ${target}`,
        source: "heuristic" as const,
        changes: [
          change(`rankingWeights.${c}`, "set", Math.round(w[c] * keep * 1000) / 1000, f.summary, `Less influence from a component that does not predict this user's likes.`),
          change(`rankingWeights.${target}`, "add", Math.round(w[c] * (1 - keep) * 1000) / 1000, `${target} has the strongest outcome correlation (r=${report.componentCorrelation[target].toFixed(2)}).`, `Predictions lean on the component that best tracks actual likes.`),
        ],
      }));
    }
    case "underweighted_component": {
      const c = f.component!;
      return [0.1, 0.2].map((delta) => ({
        id: `boost-${c}-${delta}`,
        label: `Increase ${c} weight`,
        source: "heuristic" as const,
        changes: [change(`rankingWeights.${c}`, "add", delta, f.summary, `More weight on a strong predictor of likes.`)],
      }));
    }
    case "ignored_negative_preference":
      return [1.3, 1.7].map((scale) => ({
        id: `negative-${scale}`,
        label: "Penalize known dislikes harder",
        source: "heuristic" as const,
        changes: [
          change("memoryPolicy.negativeMemoryWeight", "set", Math.min(3, Math.round(mp.negativeMemoryWeight * scale * 100) / 100), f.summary, "Homes with features the user rejects stop being predicted as likes."),
        ],
      }));
    case "recent_preference_shift":
      return [
        {
          id: "recent-weight",
          label: "Trust recent behavior more",
          source: "heuristic",
          changes: [
            change("memoryPolicy.recentMemoryWeight", "set", Math.max(1.2, mp.recentMemoryWeight + 0.7), f.summary, "Predictions follow the user's current taste instead of older sessions."),
            change("contextPolicy.includeRecentMemories", "set", true, f.summary, "Recent-shift memories are included in the preference summary used for retrieval."),
          ],
        },
        {
          id: "recent-window",
          label: "Shorten the recent memory window and weight it up",
          source: "heuristic",
          changes: [
            change("memoryPolicy.recentInteractionWindow", "set", Math.max(10, Math.round(mp.recentInteractionWindow * 0.5)), f.summary, "The recent view reflects only the latest behavior."),
            change("memoryPolicy.recentMemoryWeight", "set", Math.max(1.5, mp.recentMemoryWeight + 1), f.summary, "Recent evidence dominates stale history."),
          ],
        },
      ];
    case "stale_long_term_memory":
      return [
        {
          id: "long-term-weight",
          label: "Rebalance toward long-term memory",
          source: "heuristic",
          changes: [
            change("memoryPolicy.longTermMemoryWeight", "set", Math.min(3, mp.longTermMemoryWeight + 0.5), f.summary, "Stable long-term taste outweighs noisy recent swipes."),
            change("memoryPolicy.recentMemoryWeight", "set", Math.max(0.2, mp.recentMemoryWeight * 0.6), f.summary, "Less over-reaction to the last few interactions."),
          ],
        },
      ];
    case "overfit_single_dimension":
      return [
        {
          id: `dampen-${f.dimension}`,
          label: `Dampen ${dimensionLabel(f.dimension!)}`,
          source: "heuristic",
          changes: [change(`featureImportance.${f.dimension}`, "set", 0.6, f.summary, `Recommendations stop over-fitting to ${dimensionLabel(f.dimension!).toLowerCase()}.`)],
        },
      ];
    case "underweighted_dimension":
      return [1.6, 2.2].map((value) => ({
        id: `emphasize-${f.dimension}-${value}`,
        label: `Emphasize ${dimensionLabel(f.dimension!)}`,
        source: "heuristic" as const,
        changes: [change(`featureImportance.${f.dimension}`, "set", value, f.summary, `${dimensionLabel(f.dimension!)} counts more in matching.`)],
      }));
    default:
      return [];
  }
}

/** Retrieval/exploration changes: justified by evidence but not measurable by offline replay. */
function retrievalChanges(report: FailureReport, policy: HarnessPolicy, ctx: ProposalContext): PolicyChange[] {
  const changes: PolicyChange[] = [];
  const explore = report.findings.find((f) => f.category === "too_little_exploration");
  if (explore) {
    changes.push(change("explorationPolicy.strategy", "set", "uncertainty", explore.summary, "Exploration targets the least-understood dimensions instead of random homes."));
    changes.push(change("explorationPolicy.rate", "set", Math.max(policy.explorationPolicy.rate, 0.12), explore.summary, "More homes chosen to resolve uncertain preferences."));
    changes.push(change("contextPolicy.includeUncertaintyMemories", "set", true, explore.summary, "Uncertain dimensions are tracked in the preference summary."));
  }
  const excessive = report.findings.find((f) => f.category === "excessive_exploration");
  if (excessive) {
    changes.push(change("explorationPolicy.rate", "set", Math.max(0.03, policy.explorationPolicy.rate * 0.5), excessive.summary, "Fewer low-yield exploration slots."));
  }
  if (!policy.candidateGenerators.similarLiked.enabled && ctx.positiveInteractionCount >= 5 && report.componentCorrelation.behavior >= 0.15) {
    changes.push(
      change("candidateGenerators.similarLiked.enabled", "set", true, `Similarity to engaged homes correlates with likes (r=${report.componentCorrelation.behavior.toFixed(2)}) across ${ctx.positiveInteractionCount} positive interactions.`, "Retrieval pulls in neighbors of homes the user liked."),
    );
  }
  if (!policy.candidateGenerators.savedAnchor.enabled && ctx.saveCount >= 2) {
    changes.push(change("candidateGenerators.savedAnchor.enabled", "set", true, `The user has saved ${ctx.saveCount} homes — the strongest positive signal available.`, "Retrieval anchors on saved homes."));
  }
  return changes;
}

/**
 * Generates bounded candidate policies from failure findings: single fixes, pairwise
 * combinations of the most severe fixes, and a data-driven component reweight.
 */
export function proposeCandidates(policy: HarnessPolicy, report: FailureReport, ctx: ProposalContext): {
  candidates: CandidateProposal[];
  retrieval: PolicyChange[];
} {
  const singles = report.findings.flatMap((f) => proposalsForFinding(f, policy, report));
  const candidates: CandidateProposal[] = [...singles];

  const leaders = report.findings
    .map((f) => proposalsForFinding(f, policy, report)[0])
    .filter((p): p is CandidateProposal => p !== undefined)
    .slice(0, 4);
  for (let i = 0; i < leaders.length; i++) {
    for (let j = i + 1; j < leaders.length; j++) {
      candidates.push({
        id: `${leaders[i].id}+${leaders[j].id}`,
        label: `${leaders[i].label} + ${leaders[j].label.toLowerCase()}`,
        source: "heuristic",
        changes: [...leaders[i].changes, ...leaders[j].changes],
      });
    }
  }
  if (leaders.length > 2) {
    candidates.push({ id: "combined", label: "Apply all leading fixes", source: "heuristic", changes: leaders.flatMap((l) => l.changes) });
  }

  // Data-driven reweight: component weights proportional to their outcome correlation.
  const positive = PREDICTIVE_COMPONENTS.map((c) => Math.max(0.02, report.componentCorrelation[c]));
  const total = positive.reduce((s, v) => s + v, 0);
  const predictiveMass = PREDICTIVE_COMPONENTS.reduce((s, c) => s + policy.rankingWeights[c], 0);
  candidates.push({
    id: "correlation-reweight",
    label: "Reweight components by predictive power",
    source: "heuristic",
    changes: PREDICTIVE_COMPONENTS.map((c, i) =>
      change(
        `rankingWeights.${c}`,
        "set",
        Math.round((positive[i] / total) * predictiveMass * 1000) / 1000,
        `Outcome correlation r=${report.componentCorrelation[c].toFixed(2)} (training replay).`,
        "Component influence matches measured predictive power.",
      ),
    ),
  });

  return { candidates, retrieval: retrievalChanges(report, policy, ctx) };
}

/** Local search around the best candidate: small steps on the most influential parameters. */
export function perturbations(base: HarnessPolicy, report: FailureReport): CandidateProposal[] {
  const out: CandidateProposal[] = [];
  const best = bestComponent(report);
  const evidence = `Local search around the best training candidate (strongest component: ${best}).`;
  for (const delta of [0.05, -0.05]) {
    out.push({
      id: `search-${best}-${delta}`,
      label: `Fine-tune ${best} weight`,
      source: "search",
      changes: [change(`rankingWeights.${best}`, "add", delta, evidence, "Small refinement of the leading component.")],
    });
  }
  for (const scale of [1.2, 0.85]) {
    out.push({
      id: `search-negative-${scale}`,
      label: "Fine-tune negative memory weight",
      source: "search",
      changes: [change("memoryPolicy.negativeMemoryWeight", "scale", scale, evidence, "Small refinement of dislike penalties.")],
    });
  }
  for (const value of [base.memoryPolicy.recentMemoryWeight + 0.4, Math.max(0, base.memoryPolicy.recentMemoryWeight - 0.4)]) {
    out.push({
      id: `search-recent-${value.toFixed(2)}`,
      label: "Fine-tune recent memory weight",
      source: "search",
      changes: [change("memoryPolicy.recentMemoryWeight", "set", Math.round(value * 100) / 100, evidence, "Small refinement of recency balance.")],
    });
  }
  return out;
}
