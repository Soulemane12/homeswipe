"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { MatchBadge } from "@/components/property/match-badge";
import { PropertyFacts } from "@/components/property/property-card";
import { PropertyImage } from "@/components/property/property-image";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/client/api";
import { formatPrice } from "@/lib/utils/format";
import type { PropertyCardData } from "@/models/card";
import type { HardConstraints } from "@/models/user";
import { SvgMap } from "./svg-map";

const MapboxMap = dynamic(() => import("./mapbox-map"), { ssr: false, loading: () => <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin" /></div> });

function fits(p: PropertyCardData, c: HardConstraints): boolean {
  return (
    (c.maxPrice === undefined || p.price <= c.maxPrice) &&
    (c.minPrice === undefined || p.price >= c.minPrice) &&
    p.bedrooms >= c.minBedrooms &&
    p.bathrooms >= c.minBathrooms &&
    (c.propertyTypes.length === 0 || c.propertyTypes.includes(p.propertyType)) &&
    (c.boroughs.length === 0 || c.boroughs.includes(p.borough))
  );
}

export function MapExperience({ mapboxToken, constraints, focusId }: { mapboxToken?: string; constraints: HardConstraints; focusId?: string }) {
  const [all, setAll] = useState<PropertyCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(focusId);

  useEffect(() => {
    apiFetch<{ properties: PropertyCardData[] }>("/api/properties?limit=200")
      .then((r) => setAll(r.properties))
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    const list = (all ?? []).filter((p) => !onlyMine || fits(p, constraints) || p.id === focusId);
    return list.sort((a, b) => (b.match?.percent ?? 0) - (a.match?.percent ?? 0));
  }, [all, onlyMine, constraints, focusId]);
  const selected = visible.find((p) => p.id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative h-[60vh] overflow-hidden rounded-3xl border bg-secondary lg:h-[calc(100vh-12rem)]">
        {error ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">{error}</div>
        ) : !all ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : mapboxToken ? (
          <MapboxMap token={mapboxToken} properties={visible} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <SvgMap properties={visible} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {!mapboxToken && all && <span className="absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">Simplified map (no Mapbox token configured)</span>}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 flex gap-3 rounded-2xl border bg-card p-3 shadow-lg md:inset-x-auto md:left-3 md:w-96">
            <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
              <PropertyImage src={selected.media[0]?.url} alt={selected.media[0]?.alt ?? selected.headline} sizes="96px" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-semibold tabular">{formatPrice(selected.price)}</p>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(undefined)} aria-label="Close preview">
                  <X />
                </Button>
              </div>
              <p className="truncate text-sm">{selected.headline}</p>
              <PropertyFacts p={selected} className="text-xs" />
              <div className="mt-1.5 flex items-center gap-2">
                {selected.match && <MatchBadge percent={selected.match.percent} size="sm" />}
                <Link href={`/property/${selected.id}`} prefetch={false} className="text-xs font-medium underline underline-offset-4">
                  View home
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col">
        <label className="mb-3 flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
          Only homes that fit my criteria
          <Switch checked={onlyMine} onCheckedChange={setOnlyMine} />
        </label>
        <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
          {visible.length} homes · sorted by match
        </p>
        <ul className="space-y-1 overflow-y-auto lg:max-h-[calc(100vh-17rem)]">
          {visible.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setSelectedId(p.id)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted ${p.id === selectedId ? "bg-muted" : ""}`}>
                <div className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <PropertyImage src={p.media[0]?.url} alt="" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular">{formatPrice(p.price)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.neighborhood} · {p.bedrooms === 0 ? "Studio" : `${p.bedrooms} bd`}
                  </p>
                </div>
                {p.match && <span className="text-xs font-medium text-primary tabular">{p.match.percent}%</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
