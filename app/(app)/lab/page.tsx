import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { AccuracyChart, type VersionPoint } from "@/components/lab/accuracy-chart";
import { pct } from "@/components/lab/format";
import { LabControls } from "@/components/lab/lab-controls";
import { PolicyTimeline } from "@/components/lab/policy-timeline";
import { RunsList } from "@/components/lab/runs-list";
import { getCurrentUserId } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import type { DataScope } from "@/models/harness";
import { getLabOverview } from "@/services/harness/overview";

export const metadata: Metadata = { title: "Harness lab" };
export const maxDuration = 60;

const SCOPES: { key: DataScope; label: string }[] = [
  { key: "real", label: "Real" },
  { key: "simulated", label: "Simulated" },
  { key: "combined", label: "Combined" },
];

function Tile({ label, value, sub, warning }: { label: string; value: React.ReactNode; sub?: React.ReactNode; warning?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {warning && <p className="mt-1.5 text-xs font-medium text-nope">⚠ {warning}</p>}
    </div>
  );
}

/** Raw accuracy is misleading when nearly every outcome is the same (e.g. all dislikes). */
function oneSidedWarning(likes: number, dislikes: number): string | undefined {
  const n = likes + dislikes;
  if (n < 10) return undefined;
  const share = likes / n;
  if (share <= 0.1) return `${dislikes} of ${n} outcomes were dislikes — accuracy is inflated; use balanced accuracy.`;
  if (share >= 0.9) return `${likes} of ${n} outcomes were likes — accuracy is inflated; use balanced accuracy.`;
  return undefined;
}

export default async function LabPage(props: PageProps<"/lab">) {
  const { scope: rawScope } = await props.searchParams;
  const scope: DataScope = rawScope === "simulated" || rawScope === "combined" ? rawScope : "real";
  const o = await getLabOverview(await getCurrentUserId(), scope);
  const m = o.activeMetrics;

  const points: VersionPoint[] = o.live.map((l) => {
    const same = o.comparison.versions.find((v) => v.version === l.version);
    return {
      version: l.version,
      status: l.status,
      sameData: same ? { accuracy: same.metrics.accuracy, n: same.metrics.n } : undefined,
      live: { accuracy: l.metrics.accuracy, n: l.metrics.n, low: l.metrics.accuracyCI.low, high: l.metrics.accuracyCI.high },
    };
  });
  const scopeCount = (s: DataScope) => (s === "real" ? o.totals.real.resolved : s === "simulated" ? o.totals.simulated.resolved : o.totals.resolved);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Recursive harness · judge view</p>
          <h1 className="mt-1 font-display text-5xl">Harness lab</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every number here is computed from MongoDB documents: predictions persisted before each impression, resolved outcomes, evaluation runs and immutable policy versions.
          </p>
        </div>
        <nav aria-label="Data scope" className="inline-flex rounded-full border bg-card p-1">
          {SCOPES.map((s) => (
            <Link
              key={s.key}
              href={`/lab?scope=${s.key}`}
              prefetch={false}
              aria-current={scope === s.key ? "page" : undefined}
              className={cn("rounded-full px-4 py-1.5 text-sm", scope === s.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {s.label} <span className="tabular opacity-70">{scopeCount(s.key)}</span>
            </Link>
          ))}
        </nav>
      </div>
      {scope !== "real" && (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground">
          Showing {scope === "simulated" ? "only simulated" : "real and simulated"} outcomes. Simulated users come from hidden preference profiles in the lab — these numbers do not describe real human behavior.
        </p>
      )}

      <section aria-label="Current harness" className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Active harness" value={`v${o.activeVersion}`} sub={`${o.policies.length} versions, ${o.policies.filter((p) => p.status === "rejected").length} rejected`} />
        <Tile label="Interactions" value={o.totals.interactions} sub={`${o.totals.real.interactions} real · ${o.totals.simulated.interactions} simulated`} />
        <Tile
          label={`Prediction accuracy (v${o.activeVersion})`}
          value={m.n > 0 ? pct(m.accuracy) : "—"}
          sub={m.n > 0 ? `n=${m.n} · 95% CI ${pct(m.accuracyCI.low)}–${pct(m.accuracyCI.high)} · balanced ${pct(m.balancedAccuracy)}` : "No resolved predictions yet"}
          warning={oneSidedWarning(m.likes, m.dislikes)}
        />
        <Tile label="Top-3 like rate" value={m.topNCount > 0 ? pct(m.topNLikeRate) : "—"} sub={m.topNCount > 0 ? `n=${m.topNCount} top-ranked` : "—"} />
        <Tile label="Ranking AUC" value={m.n > 0 ? m.auc.toFixed(2) : "—"} sub="0.5 = random" />
        <Tile
          label="Calibration"
          value={o.calibration ? o.calibration.brierCalibrated.toFixed(3) : "—"}
          sub={o.calibration ? `Brier after Platt (n=${o.calibration.n}; raw ${o.calibration.brierRaw.toFixed(3)})` : scope === "combined" ? "Fit per scope, never mixed" : `Needs ${o.config.minResolved} outcomes for v${o.activeVersion}`}
        />
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Strongest learned preferences</p>
          <p className="mt-1.5 text-[15px] font-medium">{o.strongest.length > 0 ? o.strongest.map((s) => s.label).join(" · ") : "Nothing confident yet"}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Current exploration target</p>
          <p className="mt-1.5 text-[15px] font-medium">{o.explorationTarget ?? "None"}</p>
          <p className="text-xs text-muted-foreground">
            strategy {o.activePolicy.explorationPolicy.strategy} · rate {pct(o.activePolicy.explorationPolicy.rate)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Last harness change</p>
          <p className="mt-1.5 line-clamp-3 text-sm">{o.lastChange ? `v${o.lastChange.version}: ${o.lastChange.reason}` : "Still on the seeded v1 policy."}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-semibold">Prediction accuracy by harness version</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Same-data replay scores every version on the identical latest window — the fair comparison. Live accuracy is confounded by which homes each version happened to show.
          </p>
          {o.comparison.versions[0] && oneSidedWarning(o.comparison.versions[0].metrics.likes, o.comparison.versions[0].metrics.dislikes) && (
            <p className="mb-3 text-xs font-medium text-nope">
              ⚠ The latest window is almost all one outcome, so every version can score near 100% without skill. Compare ranking AUC and balanced accuracy instead.
            </p>
          )}
          <AccuracyChart points={points} windowN={o.comparison.window?.n ?? null} />
        </div>
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="font-semibold">Run the loop</h2>
          <p className="text-xs text-muted-foreground">
            Evolution needs ≥{o.config.minResolved} resolved predictions and ≥{o.config.minHoldout} holdout examples, and promotes only with ≥{pct(o.config.minAccuracyDelta)} holdout accuracy gain, more paired wins than losses, and no balanced-accuracy or top-N regression. Auto-evolution runs every {o.config.autoEvolveEvery} new real outcomes.
          </p>
          <LabControls scope={scope} demoTools={o.flags.demoTools} profiles={o.hiddenProfiles} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-4 font-mono text-[11px] text-muted-foreground">
            <dt>retrieval</dt>
            <dd>{o.retrievalMode ?? "—"}</dd>
            <dt>vector indexes</dt>
            <dd>{o.vectorIndexes.length > 0 ? o.vectorIndexes.map((v) => `${v.name.replace("property_", "")}:${v.queryable ? "ready" : v.status.toLowerCase()}`).join(", ") : "not available"}</dd>
            <dt>embeddings</dt>
            <dd>{o.flags.voyage ? "Voyage" : o.flags.openaiEmbeddings ? "OpenAI" : "local feature vectors"}</dd>
            <dt>LLM</dt>
            <dd>{o.flags.llm ? "configured (narration/proposals)" : "heuristics only"}</dd>
          </dl>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="timeline">
          <h2 id="timeline" className="mb-4 font-display text-3xl">Policy history</h2>
          <PolicyTimeline policies={o.policies} />
        </section>
        <section aria-labelledby="runs">
          <h2 id="runs" className="mb-4 font-display text-3xl">Evaluation runs</h2>
          <RunsList runs={o.runs} />
        </section>
      </div>

      <section aria-labelledby="predictions" className="mt-12">
        <h2 id="predictions" className="font-display text-3xl">Recent predictions</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Scores are raw model scores persisted before the home was shown; probabilities appear only once calibrated.</p>
        {o.recentPredictions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resolved predictions in this scope yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Home</th>
                  <th className="px-4 py-2 font-medium">Predicted</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Actual</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {o.recentPredictions.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="max-w-xs truncate px-4 py-2">
                      <Link href={`/property/${p.propertyId}`} prefetch={false} className="hover:underline">
                        {p.headline}
                      </Link>
                      {p.exploration && <span className="ml-2 rounded bg-accent px-1.5 text-[10px] text-accent-foreground">explore</span>}
                      {p.simulated && <span className="ml-1 rounded border border-dashed px-1.5 text-[10px] text-muted-foreground">sim</span>}
                    </td>
                    <td className="px-4 py-2">{p.predictedLabel}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {p.predictedLikeScore.toFixed(2)}
                      {typeof p.calibratedLikeProbability === "number" && ` (p≈${p.calibratedLikeProbability.toFixed(2)})`}
                    </td>
                    <td className="px-4 py-2">{p.actualLabel}</td>
                    <td className="px-4 py-2">{p.correct ? <Check className="size-4 text-like" aria-label="correct" /> : <X className="size-4 text-nope" aria-label="incorrect" />}</td>
                    <td className="px-4 py-2">v{p.policyVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
