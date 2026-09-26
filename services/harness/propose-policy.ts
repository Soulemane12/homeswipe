import "server-only";
import { z } from "zod";
import { generateStructured, llmAvailable } from "@/lib/ai/llm";
import type { FailureReport } from "@/lib/engine/failure-analysis";
import { PolicyChangeSchema } from "@/lib/engine/policy-patch";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import type { CandidateProposal } from "@/lib/engine/proposals";

export { proposeCandidates } from "@/lib/engine/proposals";

const LlmProposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        label: z.string().min(3).max(80),
        changes: z.array(PolicyChangeSchema).min(1).max(6),
      }),
    )
    .max(3),
});

/**
 * Optional LLM proposer. It sees the current policy JSON and quantitative findings and may
 * suggest up to three candidates — expressed ONLY as allow-listed (path, op, value) changes,
 * each with evidence and expected effect. Candidates are then validated and backtested exactly
 * like heuristic ones; nothing the model outputs is executed.
 */
export async function proposeWithLlm(policy: HarnessPolicy, report: FailureReport): Promise<CandidateProposal[]> {
  if (!llmAvailable() || report.findings.length === 0) return [];
  const out = await generateStructured({
    name: "policy_proposals",
    schema: LlmProposalSchema,
    system: [
      "You tune a recommendation policy. Propose at most 3 candidate policies as JSON changes.",
      "Allowed paths: rankingWeights.<semantic|explicit|inferred|visual|behavior|metadata|freshness|exploration>, memoryPolicy.<recentInteractionWindow|recentMemoryWeight|longTermMemoryWeight|negativeMemoryWeight|maxPositiveMemories|maxNegativeMemories>, explorationPolicy.<rate|strategy|minConfidenceTarget>, contextPolicy.<include...>, candidateGenerators.<name>.<enabled|limit>, prediction.<threshold|sharpness>, featureImportance.<dimension>.",
      "ops: set | scale | add. Every change needs evidence citing the provided findings and an expectedEffect.",
      "Never reference people, demographics, schools, religion or family status. Hard constraints (budget, bedrooms, location) are not tunable.",
    ].join(" "),
    prompt: JSON.stringify({ policy, findings: report.findings.slice(0, 6), componentCorrelation: report.componentCorrelation }),
  });
  if (!out) return [];
  return out.proposals.map((p, i) => ({ id: `llm-${i + 1}`, label: p.label, source: "llm" as const, changes: p.changes }));
}
