"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { PropertyCard, PropertyCardSkeleton } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import type { PropertyCardData } from "@/models/card";

interface FeedResponse {
  items: PropertyCardData[];
  exhausted: boolean;
  policyVersion: number;
  retrievalMode: string;
}

/**
 * Loaded on the client (not during server render/prefetch) so impressions — and their
 * predictions — are only created when a person actually sees the feed.
 */
export function DiscoverFeed({ judge }: { judge: boolean }) {
  const [items, setItems] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [meta, setMeta] = useState<{ policyVersion: number; retrievalMode: string } | null>(null);
  const started = useRef(false);

  const load = useCallback(async (append: boolean, exclude: string[]) => {
    try {
      const res = append
        ? await apiFetch<FeedResponse>("/api/recommendations/next", { body: { surface: "discover", limit: 12, excludeIds: exclude } })
        : await apiFetch<FeedResponse>("/api/recommendations?surface=discover&limit=12");
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setExhausted(res.items.length === 0 || res.exhausted);
      setMeta({ policyVersion: res.policyVersion, retrievalMode: res.retrievalMode });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(false, []).finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading recommendations">
        {Array.from({ length: 6 }, (_, i) => (
          <PropertyCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center">
        <p className="font-medium">We couldn&apos;t load your recommendations.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => { setLoading(true); void load(false, []).finally(() => setLoading(false)); }}>
          <RefreshCw /> Try again
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border p-10 text-center">
        <p className="font-display text-2xl">You&apos;ve seen every home that fits your criteria.</p>
        <p className="mt-2 text-sm text-muted-foreground">Widen your budget or neighborhoods to see more — your learned preferences carry over.</p>
        <Button asChild className="mt-5 rounded-full" variant="outline">
          <Link href="/profile">Edit search criteria</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      {judge && meta && (
        <p className="mb-4 font-mono text-xs text-muted-foreground">
          harness v{meta.policyVersion} · retrieval: {meta.retrievalMode} · predictions persisted before display
        </p>
      )}
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p, i) => (
          <PropertyCard key={`${p.id}-${p.impressionId}`} property={p} surface="discover" priority={i < 3} onHide={(id) => setItems((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </div>
      <div className="mt-12 flex justify-center">
        {exhausted ? (
          <p className="text-sm text-muted-foreground">That&apos;s everything that fits your criteria for now.</p>
        ) : (
          <Button
            variant="outline"
            className="rounded-full px-5"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await load(true, items.map((x) => x.id));
              setLoadingMore(false);
            }}
          >
            {loadingMore && <Loader2 className="animate-spin" />} Show more homes
          </Button>
        )}
      </div>
    </div>
  );
}
