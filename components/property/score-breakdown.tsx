import type { ScoreBreakdown } from "@/lib/engine/types";

const LABELS: [keyof ScoreBreakdown, string][] = [
  ["semantic", "Semantic"],
  ["explicit", "Explicit prefs"],
  ["inferred", "Learned lifestyle"],
  ["visual", "Learned visual"],
  ["behavior", "Similar to engaged"],
  ["metadata", "Metadata fit"],
  ["freshness", "Freshness"],
  ["exploration", "Exploration value"],
];

/** Judge-mode breakdown of the ranking components (0.5 = neutral). */
export function ScoreBreakdownBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <dl className="grid gap-1.5 font-mono text-xs">
      {LABELS.map(([key, label]) => (
        <div key={key} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round(breakdown[key] * 100)}%` }} />
          </dd>
          <dd className="text-right tabular">{breakdown[key].toFixed(2)}</dd>
        </div>
      ))}
      <div className="mt-1 grid grid-cols-[9rem_1fr_3rem] gap-2 border-t pt-1.5">
        <dt className="font-medium">Fit / total</dt>
        <dd />
        <dd className="text-right tabular">
          {breakdown.fit.toFixed(2)}/{breakdown.total.toFixed(2)}
        </dd>
      </div>
    </dl>
  );
}
