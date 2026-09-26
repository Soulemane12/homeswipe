"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Trash2 } from "lucide-react";
import { useCompare } from "@/components/compare/compare-provider";
import { PropertyCard, PropertyCardSkeleton } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/models/card";

interface CollectionOption {
  id: string;
  name: string;
  kind: string;
}
type SavedCard = PropertyCardData & { collectionIds: string[] };

const HINT: Record<string, string> = {
  dream: "Homes here count as a stronger style signal.",
  tour: "Shortlist for viewings.",
};

export function SavedView() {
  const compare = useCompare();
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [saved, setSaved] = useState<SavedCard[] | null>(null);
  const [active, setActive] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiFetch<{ collections: CollectionOption[]; saved: SavedCard[] }>("/api/saved")
        .then((res) => {
          setCollections(res.collections);
          setSaved(res.saved);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );

  useEffect(() => {
    apiFetch<{ collections: CollectionOption[]; saved: SavedCard[] }>("/api/saved")
      .then((res) => {
        setCollections(res.collections);
        setSaved(res.saved);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function createCollection() {
    try {
      const c = await apiFetch<CollectionOption>("/api/collections", { body: { name } });
      setCollections((prev) => [...prev, c]);
      setCreating(false);
      setName("");
      setActive(c.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteCollection(id: string) {
    try {
      await apiFetch(`/api/collections/${id}`, { method: "DELETE" });
      setActive("all");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveTo(propertyId: string, collectionId: string) {
    try {
      await apiFetch("/api/saved", { body: { propertyId, action: "save", collectionId, sourceSurface: "saved" } });
      await load();
      toast(`Added to ${collections.find((c) => c.id === collectionId)?.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">{error}</p>;
  const visible = (saved ?? []).filter((s) => active === "all" || s.collectionIds.includes(active));
  const activeCollection = collections.find((c) => c.id === active);

  return (
    <div>
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Collections">
        {[{ id: "all", name: "All saved", kind: "all" }, ...collections].map((c) => {
          const count = c.id === "all" ? (saved?.length ?? 0) : (saved ?? []).filter((s) => s.collectionIds.includes(c.id)).length;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active === c.id}
              onClick={() => setActive(c.id)}
              className={cn("shrink-0 rounded-full border px-4 py-2 text-sm", active === c.id ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              {c.name} <span className="ml-1 opacity-60 tabular">{count}</span>
            </button>
          );
        })}
        <Button variant="ghost" className="shrink-0 rounded-full" onClick={() => setCreating(true)}>
          <FolderPlus /> New collection
        </Button>
      </div>
      {activeCollection && (
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          <span>{HINT[activeCollection.kind] ?? "Your custom collection."}</span>
          {activeCollection.kind === "custom" && (
            <Button variant="ghost" size="sm" onClick={() => void deleteCollection(activeCollection.id)}>
              <Trash2 /> Delete collection
            </Button>
          )}
        </div>
      )}

      <div className="mt-8">
        {!saved ? (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center">
            <p className="font-display text-2xl">{active === "all" ? "No saved homes yet" : "Nothing in this collection yet"}</p>
            <p className="mt-2 text-sm text-muted-foreground">Tap the heart on any home to save it. Saves are one of the strongest signals HomeSwipe learns from.</p>
            <Button asChild className="mt-5 rounded-full">
              <Link href="/discover">Discover homes</Link>
            </Button>
          </div>
        ) : (
          <>
            {visible.length >= 2 && (
              <div className="mb-6 flex justify-end">
                <Button variant="outline" className="rounded-full" onClick={() => compare.replace(visible.slice(0, 4).map((v) => v.id), "saved")}>
                  Compare {Math.min(4, visible.length)} of these
                </Button>
              </div>
            )}
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <div key={p.id}>
                  <PropertyCard property={p} surface="saved" allowHide={false} />
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    Add to
                    <select className="h-8 rounded-lg border bg-background px-2 text-xs" value="" onChange={(e) => e.target.value && void moveTo(p.id, e.target.value)}>
                      <option value="">Choose collection…</option>
                      {collections.filter((c) => !p.collectionIds.includes(c.id)).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Group homes however you like — by neighborhood, by budget, or for a partner to review.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brooklyn shortlist" maxLength={60} aria-label="Collection name" />
          <DialogFooter>
            <Button onClick={() => void createCollection()} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
