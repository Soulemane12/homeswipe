import "server-only";
import { z } from "zod";
import { generateStructured, llmAvailable } from "@/lib/ai/llm";
import type { FailureReport } from "@/lib/engine/failure-analysis";
import { checkPreferenceText } from "@/lib/guardrails/fair-housing";

export { analyzeFailures } from "@/lib/engine/failure-analysis";

const NarrativeSchema = z.object({ narrative: z.string().min(20).max(700) });

/**
 * Optional plain-language narration of a failure report. The LLM receives only the computed
 * findings and may not introduce numbers of its own; if unavailable, a deterministic summary
 * is used. Metrics always come from replay, never from the model.
 */
export async function narrateFailures(report: FailureReport): Promise<string> {
  const fallback =
    report.findings.length === 0
      ? `No systematic failure pattern across ${report.n} training predictions (${report.errors} errors).`
      : `${report.errors} of ${report.n} training predictions were wrong. ${report.findings
          .slice(0, 3)
          .map((f) => f.summary)
          .join(" ")}`;
  if (!llmAvailable() || report.findings.length === 0) return fallback;
  const out = await generateStructured({
    name: "failure_narrative",
    schema: NarrativeSchema,
    system:
      "You explain recommender failure analysis to engineers in 2-3 sentences. Use ONLY the numbers present in the findings JSON; do not invent metrics. Refer to property attributes only.",
    prompt: JSON.stringify({ n: report.n, errors: report.errors, falsePositives: report.falsePositives, falseNegatives: report.falseNegatives, findings: report.findings.slice(0, 5) }),
  });
  if (!out || !checkPreferenceText(out.narrative).allowed) return fallback;
  return out.narrative;
}
