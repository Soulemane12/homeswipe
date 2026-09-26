"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trophy, X } from "lucide-react";
import { MatchBadge } from "@/components/property/match-badge";
import { PropertyImage } from "@/components/property/property-image";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { formatBaths, formatNumber, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/models/card";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import { useCompare } from "./compare-provider";

interface CompareProperty extends PropertyCardData {
  details: { taxesAnnual?: number; estimatedMonthly?: number; yearBuilt?: number; pricePerSqft?: number; features: string[] };
}
interface CompareResult {
  properties: CompareProperty[];
  priorities: { dimension: string; label: string; direction: "positive" | "negative"; weight: number }[];
  matrix: { dimension: string; label: string; direction: "positive" | "negative"; values: { id: string; value: number }[]; winnerId?: string }[];
  summary: string;
  bestMatchId?: string;
}

function level(v: number): string {
  return v >= 0.7 ? "Yes" : v >= 0.4 ? "Some" : "No";
}

export function CompareView({ initialIds }: { initialIds: string[] }) {
  const compare = useCompare();
  const [explicitIds, setExplicitIds] = useState(initialIds);
  // Without ids in the URL, compare whatever is in the compare tray.
  const ids = initialIds.length > 0 ? explicitIds : compare.ids;
  const key = ids.join(",");
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    if (key.split(",").filter(Boolean).length < 2) return;
    apiFetch<CompareResult>("/api/compare", { body: { ids: key.split(",") } })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    window.history.replaceState(null, "", `/compare?ids=${key}`);
  }, [key]);

  async function explain() {
    setPolishing(true);
    try {
      const r = await apiFetch<CompareResult>("/api/compare", { body: { ids, polish: true } });
      setData(r);
    } finally {
      setPolishing(false);
    }
  }

  if (ids.length < 2) {
    return (
      <div className="rounded-2xl border p-10 text-center">
        <p className="font-display text-2xl">Pick at least two homes to compare</p>
        <p className="mt-2 text-sm text-muted-foreground">Use “Compare” on any home card, or compare straight from your saved homes.</p>
        <Button asChild className="mt-5 rounded-full">
          <Link href="/saved">Go to saved homes</Link>
        </Button>
      </div>
    );
  }
  if (error) return <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">{error}</p>;
  if (!data) {
    return (
      <div className="grid h-60 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cols = data.properties;
  const rows: { label: string; render: (p: CompareProperty) => React.ReactNode }[] = [
    { label: "Price", render: (p) => formatPrice(p.price) },
    { label: "Est. monthly", render: (p) => (p.details.estimatedMonthly ? `${formatPrice(p.details.estimatedMonthly)}/mo` : "—") },
    { label: "Beds / baths", render: (p) => `${p.bedrooms === 0 ? "Studio" : p.bedrooms} / ${formatBaths(p.bathrooms)}` },
    { label: "Size", render: (p) => (p.sqft ? `${formatNumber(p.sqft)} sqft` : "—") },
    { label: "Price / sqft", render: (p) => (p.details.pricePerSqft ? formatPrice(p.details.pricePerSqft) : "—") },
    { label: "HOA / maintenance", render: (p) => (p.hoa ? `${formatPrice(p.hoa)}/mo` : "None") },
    { label: "Taxes", render: (p) => (p.details.taxesAnnual ? `${formatPrice(p.details.taxesAnnual)}/yr` : "—") },
    { label: "Year built", render: (p) => p.details.yearBuilt ?? "—" },
    { label: "Type", render: (p) => PROPERTY_TYPE_LABEL[p.propertyType] },
    { label: "Neighborhood", render: (p) => `${p.neighborhood}, ${p.borough}` },
    { label: "Match", render: (p) => (p.match ? <MatchBadge percent={p.match.percent} size="sm" /> : "—") },
    { label: "Why it matches", render: (p) => p.match?.reasons.join(", ") || "—" },
    { label: "Tradeoffs", render: (p) => p.match?.tradeoffs.join(", ") || "—" },
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="priorities" className="rounded-3xl border bg-accent/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="priorities" className="flex items-center gap-2 font-display text-2xl">
            <Sparkles className="size-5 text-primary" aria-hidden="true" /> Compared on what you care about
          </h2>
          <Button variant="outline" size="sm" className="rounded-full bg-background" onClick={() => void explain()} disabled={polishing}>
            {polishing && <Loader2 className="animate-spin" />} Rewrite summary
          </Button>
        </div>
        <p className="mt-3 max-w-3xl text-[15px]">{data.summary}</p>
        {data.matrix.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-[38%] py-2 pr-4 font-medium">Your priority</th>
                  {cols.map((p) => (
                    <th key={p.id} className="truncate py-2 pr-2 font-medium" title={p.neighborhood}>
                      {p.neighborhood}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row) => (
                  <tr key={row.dimension} className="border-t border-foreground/10">
                    <td className="py-2 pr-4">
                      {row.direction === "negative" ? "Avoid: " : ""}
                      {row.label}
                    </td>
                    {row.values.map((v) => (
                      <td key={v.id} className={cn("py-2 pr-4", row.winnerId === v.id && "font-semibold text-primary")}>
                        {level(v.value)}
                        {row.winnerId === v.id && <Trophy className="ml-1 inline size-3.5" aria-label="Best on this priority" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-x-3 text-sm">
          <colgroup>
            <col className="w-36" />
            {cols.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th />
              {cols.map((p) => (
                <th key={p.id} className="align-top text-left font-normal">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                    <PropertyImage src={p.media[0]?.url} alt={p.media[0]?.alt ?? p.headline} sizes="280px" />
                    {data.bestMatchId === p.id && <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Best fit for you</span>}
                    <button
                      type="button"
                      className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/90"
                      onClick={() => {
                        compare.remove(p.id);
                        setExplicitIds((prev) => prev.filter((x) => x !== p.id));
                      }}
                      aria-label={`Remove ${p.headline} from comparison`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <Link href={`/property/${p.id}`} prefetch={false} className="mt-2 line-clamp-2 block font-medium hover:underline">
                    {p.headline}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-t py-3 text-left align-top text-xs font-medium text-muted-foreground">
                  {row.label}
                </th>
                {cols.map((p) => (
                  <td key={p.id} className="border-t py-3 align-top tabular">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
