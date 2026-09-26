"use client";

import { useState } from "react";

export interface VersionPoint {
  version: number;
  status: string;
  sameData?: { accuracy: number; n: number };
  live?: { accuracy: number; n: number; low: number; high: number };
}

const SERIES = {
  sameData: { color: "#036f4f", label: "Same-data replay" },
  live: { color: "#cf7b26", label: "Live (as shown)" },
} as const;

const H = 220;
const PAD = { top: 20, right: 12, bottom: 36, left: 40 };
const BAR = 22;

/**
 * Accuracy per harness version. "Same-data replay" evaluates every version on the identical
 * most-recent window (the fair comparison); "Live" is what each version scored on the homes it
 * actually showed, which is confounded by inventory. Values come straight from MongoDB.
 */
export function AccuracyChart({ points, windowN }: { points: VersionPoint[]; windowN: number | null }) {
  const [hover, setHover] = useState<{ version: number; key: keyof typeof SERIES } | null>(null);
  const [showTable, setShowTable] = useState(false);
  const groupWidth = 76;
  const width = Math.max(320, PAD.left + PAD.right + points.length * groupWidth);
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH * (1 - v);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hover ? points.find((p) => p.version === hover.version) : null;

  if (points.length === 0) return <p className="text-sm text-muted-foreground">No policy versions with resolved predictions in this scope yet.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {(Object.keys(SERIES) as (keyof typeof SERIES)[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: SERIES[k].color }} aria-hidden="true" />
            {SERIES[k].label}
            {k === "sameData" && windowN ? ` (latest ${windowN})` : ""}
          </span>
        ))}
        <button type="button" onClick={() => setShowTable((s) => !s)} className="ml-auto underline underline-offset-4">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Version</th>
              <th className="py-1.5 font-medium">Same-data replay</th>
              <th className="py-1.5 font-medium">Live accuracy (95% CI)</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.version} className="border-t">
                <td className="py-1.5">v{p.version} <span className="text-xs text-muted-foreground">{p.status}</span></td>
                <td className="py-1.5">{p.sameData ? `${(p.sameData.accuracy * 100).toFixed(0)}% (n=${p.sameData.n})` : "—"}</td>
                <td className="py-1.5">{p.live && p.live.n > 0 ? `${(p.live.accuracy * 100).toFixed(0)}% (n=${p.live.n}, ${(p.live.low * 100).toFixed(0)}–${(p.live.high * 100).toFixed(0)}%)` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="Prediction accuracy by harness version">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
                  {t * 100}%
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + i * groupWidth + groupWidth / 2;
              const bars: { key: keyof typeof SERIES; value?: number; n?: number }[] = [
                { key: "sameData", value: p.sameData?.accuracy, n: p.sameData?.n },
                { key: "live", value: p.live && p.live.n > 0 ? p.live.accuracy : undefined, n: p.live?.n },
              ];
              return (
                <g key={p.version}>
                  {bars.map((b, j) => {
                    const x = cx - BAR - 1 + j * (BAR + 2);
                    if (b.value === undefined) {
                      return <text key={b.key} x={x + BAR / 2} y={y(0) - 4} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">–</text>;
                    }
                    const top = y(b.value);
                    const h = y(0) - top;
                    const r = Math.min(4, h);
                    const active = hover?.version === p.version && hover.key === b.key;
                    return (
                      <g
                        key={b.key}
                        tabIndex={0}
                        role="button"
                        aria-label={`v${p.version} ${SERIES[b.key].label}: ${(b.value * 100).toFixed(0)}% (n=${b.n})`}
                        onPointerEnter={() => setHover({ version: p.version, key: b.key })}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover({ version: p.version, key: b.key })}
                        onBlur={() => setHover(null)}
                        className="outline-none"
                      >
                        <rect x={x - 3} y={PAD.top} width={BAR + 6} height={plotH} fill="transparent" />
                        <path
                          d={`M${x},${y(0)} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + BAR - r},${top} Q${x + BAR},${top} ${x + BAR},${top + r} L${x + BAR},${y(0)} Z`}
                          fill={SERIES[b.key].color}
                          opacity={hover && !active ? 0.55 : 1}
                        />
                        {b.key === "sameData" && (
                          <text x={x + BAR / 2} y={top - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
                            {(b.value * 100).toFixed(0)}%
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x={cx} y={H - PAD.bottom + 18} textAnchor="middle" fontSize="12" fill="var(--foreground)">
                    v{p.version}
                  </text>
                  <text x={cx} y={H - PAD.bottom + 31} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                    {p.status}
                  </text>
                </g>
              );
            })}
          </svg>
          {hovered && hover && (
            <div className="pointer-events-none absolute top-2 right-2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md" role="status">
              {hover.key === "sameData" && hovered.sameData ? (
                <>
                  <p className="text-sm font-semibold tabular">{(hovered.sameData.accuracy * 100).toFixed(1)}%</p>
                  <p className="text-muted-foreground">v{hovered.version} · same-data replay · n={hovered.sameData.n}</p>
                </>
              ) : hovered.live ? (
                <>
                  <p className="text-sm font-semibold tabular">{(hovered.live.accuracy * 100).toFixed(1)}%</p>
                  <p className="text-muted-foreground">
                    v{hovered.version} · live · n={hovered.live.n} · 95% CI {(hovered.live.low * 100).toFixed(0)}–{(hovered.live.high * 100).toFixed(0)}%
                  </p>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
