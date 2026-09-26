"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/client/api";
import { filtersToParams, emptyFilters, type FilterState } from "@/components/search/filter-state";

interface SavedSearch {
  id: string;
  name: string;
  query?: string;
  filters: Partial<FilterState>;
  alert: { enabled: boolean; minMatch: number };
  matching: number;
  newSinceCheck: number;
  highMatch: number;
}

/** Saved searches with in-app alert settings (delivery via email/push is on the roadmap). */
export function SavedSearches() {
  const [items, setItems] = useState<SavedSearch[] | null>(null);
  const load = useCallback(() => {
    apiFetch<{ searches: SavedSearch[] }>("/api/saved-searches")
      .then((r) => setItems(r.searches))
      .catch((e: Error) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function update(id: string, alert: SavedSearch["alert"]) {
    setItems((prev) => prev?.map((s) => (s.id === id ? { ...s, alert } : s)) ?? null);
    try {
      await apiFetch(`/api/saved-searches/${id}`, { method: "PATCH", body: { alert } });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await apiFetch(`/api/saved-searches/${id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!items) return <div className="h-20 animate-pulse rounded-2xl bg-muted" />;
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved searches yet. Use <span className="font-medium text-foreground">Save search</span> on the{" "}
        <Link href="/search" className="underline underline-offset-4">
          search page
        </Link>{" "}
        to track new listings.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-2xl border">
      {items.map((s) => {
        const params = filtersToParams({ ...emptyFilters(), ...s.filters } as FilterState, { q: s.query });
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/search?${params.toString()}`} className="font-medium hover:underline">
                {s.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {s.matching} matching · {s.newSinceCheck} new · {s.highMatch} at {s.alert.minMatch}%+ match
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
              Alert
              <Switch checked={s.alert.enabled} onCheckedChange={(enabled) => void update(s.id, { ...s.alert, enabled })} aria-label={`Alerts for ${s.name}`} />
            </label>
            <select
              className="h-8 rounded-lg border bg-background px-2 text-xs"
              value={s.alert.minMatch}
              onChange={(e) => void update(s.id, { ...s.alert, minMatch: Number(e.target.value) })}
              aria-label="Minimum match for alerts"
            >
              {[70, 80, 85, 90].map((m) => (
                <option key={m} value={m}>
                  {m}%+ match
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon-sm" onClick={() => void remove(s.id)} aria-label={`Delete ${s.name}`}>
              <Trash2 />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
