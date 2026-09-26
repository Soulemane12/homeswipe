import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluationRunDoc } from "@/models/harness";
import { pct } from "./format";

export function RunsList({ runs }: { runs: EvaluationRunDoc[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No evaluation runs yet.</p>;
  return (
    <ul className="space-y-3">
      {runs.map((r) => (
        <li key={r._id.toHexString()} className="rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.status === "promoted" ? "bg-primary text-primary-foreground" : r.status === "rejected" ? "bg-nope/10 text-nope" : "bg-secondary")}>{r.status.replace("_", " ")}</span>
            <span className="font-medium">
              v{r.currentPolicyVersion}
              {r.candidatePolicyVersion ? ` vs candidate v${r.candidatePolicyVersion}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {r.trigger} · {r.dataScope} data ({r.counts.real} real, {r.counts.simulated} simulated) · {r.durationMs} ms
            </span>
            <span className="ml-auto text-xs text-muted-foreground">{r.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          {r.currentMetrics && r.candidateMetrics && (
            <p className="mt-2 font-mono text-xs">
              holdout n={r.candidateMetrics.n}: accuracy {pct(r.currentMetrics.accuracy)} → {pct(r.candidateMetrics.accuracy)} · balanced {pct(r.currentMetrics.balancedAccuracy)} → {pct(r.candidateMetrics.balancedAccuracy)} · AUC {r.currentMetrics.auc.toFixed(2)} → {r.candidateMetrics.auc.toFixed(2)}
              {r.trainingRange && ` · training n=${r.trainingRange.n}`}
            </p>
          )}
          <p className="mt-2 text-sm text-foreground/80">{r.narrative ?? r.explanation}</p>
          {r.checks && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {r.checks.map((c) => (
                <li key={c.name} className="flex items-center gap-1" title={c.detail}>
                  {c.passed ? <Check className="size-3.5 text-like" aria-label="passed" /> : <X className="size-3.5 text-nope" aria-label="failed" />}
                  {c.name.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
