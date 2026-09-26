"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, GitCompareArrows, Heart, X } from "lucide-react";
import { useCompare } from "@/components/compare/compare-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/client/api";
import { track } from "@/lib/client/track";
import { formatBaths, formatNumber, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/models/card";
import type { SourceSurface } from "@/models/interaction";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import { JudgeChip } from "./judge-chip";
import { MatchBadge } from "./match-badge";
import { PropertyImage } from "./property-image";

export function PropertyFacts({ p, className }: { p: Pick<PropertyCardData, "bedrooms" | "bathrooms" | "sqft" | "propertyType">; className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground tabular", className)}>
      {p.bedrooms === 0 ? "Studio" : `${p.bedrooms} bd`} · {formatBaths(p.bathrooms)} ba{p.sqft ? ` · ${formatNumber(p.sqft)} sqft` : ""} · {PROPERTY_TYPE_LABEL[p.propertyType]}
    </p>
  );
}

export function matchReason(p: PropertyCardData): string | null {
  const reasons = p.match?.reasons ?? [];
  if (reasons.length === 0) return null;
  const lower = reasons.map((r) => r.charAt(0).toLowerCase() + r.slice(1));
  if (lower.length === 1) return `Strong match for ${lower[0]}.`;
  return `Strong match for ${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}.`;
}

export function PropertyCard({
  property,
  surface,
  onHide,
  priority,
  allowHide = true,
}: {
  property: PropertyCardData;
  surface: SourceSurface;
  onHide?: (id: string) => void;
  priority?: boolean;
  allowHide?: boolean;
}) {
  const router = useRouter();
  const compare = useCompare();
  const [saved, setSaved] = useState(Boolean(property.saved));
  const [busy, setBusy] = useState(false);
  const reason = matchReason(property);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try {
      await apiFetch("/api/saved", { body: { propertyId: property.id, action: next ? "save" : "unsave", sourceSurface: surface, impressionId: property.impressionId } });
      if (next) toast("Saved to Favorites", { action: { label: "View", onClick: () => router.push("/saved") } });
    } catch (e) {
      setSaved(!next);
      toast.error((e as Error).message);
    }
  }

  async function hide() {
    setBusy(true);
    try {
      await track({ type: "dislike", propertyId: property.id, impressionId: property.impressionId, sourceSurface: surface });
      onHide?.(property.id);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  function findSimilar() {
    track({ type: "find_similar", propertyId: property.id, sourceSurface: surface }).catch(() => undefined);
    router.push(`/search?similar=${property.id}`);
  }

  const inCompare = compare.has(property.id);
  return (
    <article className="group flex flex-col" aria-label={`${property.headline}, ${formatPrice(property.price)}`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
        <Link href={`/property/${property.id}`} prefetch={false} className="absolute inset-0" aria-label={`View ${property.headline}`}>
          <PropertyImage src={property.media[0]?.url} alt={property.media[0]?.alt ?? property.headline} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" priority={priority} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          {property.match ? <MatchBadge percent={property.match.percent} className="shadow-sm" /> : <span />}
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto rounded-full bg-background/90 shadow-sm backdrop-blur"
            onClick={toggleSave}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save home"}
          >
            <Heart className={cn(saved && "fill-nope text-nope")} />
          </Button>
        </div>
        {property.judge && <JudgeChip judge={property.judge} className="absolute bottom-3 left-3" />}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-semibold tracking-tight tabular">{formatPrice(property.price)}</p>
          <Link href={`/property/${property.id}`} prefetch={false} className="line-clamp-1 text-[15px] hover:underline">
            {property.headline}
          </Link>
          <p className="text-sm text-muted-foreground">
            {property.neighborhood}, {property.borough}
          </p>
          <PropertyFacts p={property} className="mt-0.5" />
        </div>
      </div>
      {reason && <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{reason}</p>}
      <div className="mt-2 -ml-2 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={findSimilar}>
              <Copy /> Similar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Find homes like this one</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="sm" onClick={() => compare.toggle(property.id, surface === "discover" || surface === "search" || surface === "saved" || surface === "map" ? surface : "property")} aria-pressed={inCompare}>
          <GitCompareArrows /> {inCompare ? "Comparing" : "Compare"}
        </Button>
        {allowHide && onHide && (
          <Button variant="ghost" size="sm" onClick={hide} disabled={busy} className="ml-auto text-muted-foreground">
            <X /> Not for me
          </Button>
        )}
      </div>
    </article>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}
