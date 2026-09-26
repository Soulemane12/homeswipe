"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BellPlus, Loader2, Map as MapIcon, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { PropertyCard, PropertyCardSkeleton } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/client/api";
import { dimensionLabel } from "@/lib/features/dimensions";
import { formatCompactPrice } from "@/lib/utils/format";
import type { PropertyCardData } from "@/models/card";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import { FilterControls } from "./filter-controls";
import { filtersToParams, filtersToRequest, type FilterState } from "./filter-state";

interface SearchResponse {
  results: PropertyCardData[];
  total: number;
  queryFilters: Record<string, unknown>;
  desired: string[];
  avoided: string[];
  parser?: "llm" | "heuristic";
  retrievalMode: string;
  anchor?: PropertyCardData;
}

function chipLabel(key: string, value: unknown): string {
  if (key === "maxPrice") return `Under ${formatCompactPrice(value as number)}`;
  if (key === "minPrice") return `Over ${formatCompactPrice(value as number)}`;
  if (key === "minBedrooms") return `${value}+ beds`;
  if (key === "minBathrooms") return `${value}+ baths`;
  if (key === "propertyTypes") return (value as string[]).map((t) => PROPERTY_TYPE_LABEL[t as keyof typeof PROPERTY_TYPE_LABEL] ?? t).join(", ");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function SearchExperience({ initialQuery, initialFilters, similarTo, judge }: { initialQuery: string; initialFilters: FilterState; similarTo?: string; judge: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [similar, setSimilar] = useState<string | undefined>(similarTo);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const requestId = useRef(0);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SearchResponse>("/api/search/semantic", {
        body: { query: submittedQuery || undefined, filters: filtersToRequest(filters), similarTo: similar, ignoreQueryFilters: ignored, limit: 36 },
      });
      if (id === requestId.current) setData(res);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // Keep the URL shareable without triggering a server round trip.
    const params = filtersToParams(filters, { q: submittedQuery || undefined, similar });
    window.history.replaceState(null, "", `/search${params.size ? `?${params.toString()}` : ""}`);
  }, [submittedQuery, filters, similar, ignored]);

  useEffect(() => {
    const t = setTimeout(() => void run(), 250);
    return () => clearTimeout(t);
  }, [run]);

  async function saveSearch() {
    try {
      await apiFetch("/api/saved-searches", { body: { name: saveName || submittedQuery || "My search", filters: filtersToRequest(filters), query: submittedQuery || undefined } });
      setSaveOpen(false);
      toast("Search saved", { description: "Find it and its alert settings in your profile.", action: { label: "Open", onClick: () => router.push("/profile") } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const queryChips = Object.entries(data?.queryFilters ?? {}).filter(([k]) => !ignored.includes(k));
  const activeFilterCount = Object.values(filtersToRequest(filters)).length;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setIgnored([]);
          setSubmittedQuery(query.trim());
        }}
        className="flex items-center gap-2 rounded-full border bg-card p-1.5 pl-5 shadow-sm focus-within:ring-3 focus-within:ring-ring/40"
      >
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="bright modern condo near transit with a big kitchen"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          aria-label="Describe the home you want"
          maxLength={300}
        />
        {query && (
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => { setQuery(""); setSubmittedQuery(""); setIgnored([]); }} aria-label="Clear search text">
            <X />
          </Button>
        )}
        <Button type="submit" className="h-10 rounded-full px-3 sm:px-5" aria-label="Search">
          <Search /> <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <FilterControls filters={filters} onChange={setFilters} layout="inline" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="rounded-full md:hidden">
              <SlidersHorizontal /> Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Explicit filters always override anything parsed from your search text.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-8">
              <FilterControls filters={filters} onChange={setFilters} layout="stacked" />
            </div>
          </SheetContent>
        </Sheet>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" className="rounded-full" onClick={() => setSaveOpen(true)}>
            <BellPlus /> Save search
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/map" prefetch={false}>
              <MapIcon /> Map
            </Link>
          </Button>
        </div>
      </div>

      {(queryChips.length > 0 || (data && (data.desired.length > 0 || data.avoided.length > 0))) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {queryChips.length > 0 && <span className="text-muted-foreground">From your search:</span>}
          {queryChips.map(([key, value]) => (
            <button key={key} type="button" onClick={() => setIgnored((i) => [...i, key])} className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-accent-foreground hover:bg-accent/70" aria-label={`Remove ${chipLabel(key, value)}`}>
              {chipLabel(key, value)} <X className="size-3" />
            </button>
          ))}
          {data && data.desired.length > 0 && (
            <span className="text-muted-foreground">
              Ranking for {data.desired.map((d) => dimensionLabel(d).toLowerCase()).join(", ")}
              {data.avoided.length > 0 && ` · avoiding ${data.avoided.map((d) => dimensionLabel(d).toLowerCase()).join(", ")}`}
            </span>
          )}
        </div>
      )}

      {data?.anchor && similar && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Homes similar to </span>
            <Link href={`/property/${data.anchor.id}`} prefetch={false} className="font-medium hover:underline">
              {data.anchor.headline}
            </Link>
            <span className="text-muted-foreground"> in {data.anchor.neighborhood}</span>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSimilar(undefined)}>
            <X /> Clear
          </Button>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-5 flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
          <span>{loading ? "Searching…" : data ? `${data.total} ${data.total === 1 ? "home" : "homes"}, personalized to your taste` : ""}</span>
          {judge && data && (
            <span className="font-mono text-xs">
              retrieval: {data.retrievalMode}
              {data.parser && ` · parser: ${data.parser}`}
            </span>
          )}
        </div>
        {error ? (
          <div className="rounded-2xl border p-8 text-center text-sm">
            <p className="font-medium">Search failed</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void run()}>
              Try again
            </Button>
          </div>
        ) : loading && !data ? (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : data && data.results.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center">
            <p className="font-display text-2xl">No homes match all of that</p>
            <p className="mt-2 text-sm text-muted-foreground">Try removing a filter or loosening your budget.</p>
          </div>
        ) : (
          <div className={`grid gap-x-6 gap-y-10 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
            {data?.results.map((p, i) => (
              <PropertyCard key={p.id} property={p} surface="search" allowHide={false} priority={i < 3} />
            ))}
          </div>
        )}
        {loading && data && (
          <div className="fixed right-6 bottom-24 rounded-full bg-card p-2 shadow md:bottom-6" aria-hidden="true">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>HomeSwipe will track new listings that fit these filters and flag strong matches.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="search-name">Name</Label>
            <Input id="search-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={submittedQuery || "My search"} maxLength={80} />
          </div>
          <DialogFooter>
            <Button onClick={() => void saveSearch()}>Save search</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
