import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HarnessPolicyDoc } from "@/models/harness";
import { formatValue, pathName, pct } from "./format";

const STATUS_STYLE: Record<HarnessPolicyDoc["status"], string> = {
  active: "bg-primary text-primary-foreground",
  retired: "bg-secondary text-secondary-foreground",
  rejected: "bg-nope/10 text-nope",
  candidate: "bg-accent text-accent-foreground",
};

/** Every policy version ever created (never mutated or deleted), with its diff and evidence. */
export function PolicyTimeline({ policies }: { policies: HarnessPolicyDoc[] }) {
  const ordered = [...policies].sort((a, b) => b.version - a.version);
  return (
    <ol className="space-y-4">
      {ordered.map((p) => (
        <li key={p.version} className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-2xl">v{p.version}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[p.status])}>{p.status}</span>
            {p.parentVersion !== null && <span className="text-xs text-muted-foreground">from v{p.parentVersion}</span>}
            <span className="text-xs text-muted-foreground">· {p.createdBy}</span>
            {p.dataScope && p.dataScope !== "real" && (
              <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">evaluated on {p.dataScope} data</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{p.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <p className="mt-2 text-sm text-foreground/80">{p.reason}</p>
          {p.evaluationSummary && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              holdout accuracy v{p.parentVersion} {pct(p.evaluationSummary.parentHoldoutAccuracy)} → v{p.version} {pct(p.evaluationSummary.holdoutAccuracy)} (n={p.evaluationSummary.holdoutN})
            </p>
          )}
          {p.diff.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1.5 font-medium">Parameter</th>
                    <th className="pb-1.5 font-medium">v{p.parentVersion}</th>
                    <th className="pb-1.5 font-medium">v{p.version}</th>
                    <th className="pb-1.5 font-medium">Backtested</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {p.diff.map((d) => {
                    const change = p.changes.find((c) => c.path === d.path);
                    const up = typeof d.from === "number" && typeof d.to === "number" ? d.to > d.from : null;
                    return (
                      <tr key={d.path} className="border-t align-top">
                        <td className="py-1.5 pr-3 font-sans text-[13px]">
                          {pathName(d.path)}
                          {change && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{change.evidence}</p>}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{formatValue(d.from)}</td>
                        <td className={cn("py-1.5 pr-3 font-semibold whitespace-nowrap", up === true && "text-like", up === false && "text-nope")}>
                          {up === true ? "▲ " : up === false ? "▼ " : ""}
                          {formatValue(d.to)}
                        </td>
                        <td className="py-1.5">
                          {change?.backtestable === false ? (
                            <span className="flex items-center gap-1 font-sans text-muted-foreground" title="Retrieval/exploration change justified by evidence; not measurable by offline replay">
                              <CircleDashed className="size-3.5" /> evidence
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-sans text-muted-foreground">
                              <CheckCircle2 className="size-3.5 text-like" /> replay
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {p.evidence.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Failure analysis that motivated this version</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
                {p.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {p.status === "rejected" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-nope">
              <XCircle className="size-3.5" /> Kept for the record; never activated.
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
