"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, GitCompareArrows, Heart, Loader2, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";
import { openCommandBar } from "@/components/command/command-events";
import { useCompare } from "@/components/compare/compare-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/client/api";
import { track } from "@/lib/client/track";
import { cn } from "@/lib/utils";

interface CollectionOption {
  id: string;
  name: string;
  kind: string;
}

export function PropertyActions({ propertyId, saved: initialSaved, collectionIds: initialCollections, reaction: initialReaction }: { propertyId: string; saved: boolean; collectionIds: string[]; reaction?: string }) {
  const router = useRouter();
  const compare = useCompare();
  const [saved, setSaved] = useState(initialSaved);
  const [inCollections, setInCollections] = useState<string[]>(initialCollections);
  const [collections, setCollections] = useState<CollectionOption[] | null>(null);
  const [reaction, setReaction] = useState(initialReaction);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadCollections() {
    if (collections) return;
    try {
      const res = await apiFetch<{ collections: CollectionOption[] }>("/api/collections");
      setCollections(res.collections);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveTo(collection: CollectionOption) {
    setBusy(collection.id);
    try {
      if (inCollections.includes(collection.id)) {
        await apiFetch("/api/saved", { body: { propertyId, action: "remove_from_collection", collectionId: collection.id } });
        const next = inCollections.filter((c) => c !== collection.id);
        setInCollections(next);
        setSaved(next.length > 0);
      } else {
        await apiFetch("/api/saved", { body: { propertyId, action: "save", collectionId: collection.id, sourceSurface: "property" } });
        setInCollections([...inCollections, collection.id]);
        setSaved(true);
        toast(`Saved to ${collection.name}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function react(type: "like" | "dislike") {
    setBusy(type);
    try {
      await track({ type, propertyId, sourceSurface: "property" });
      setReaction(type);
      if (type === "dislike") toast("Got it — not for you.", { action: { label: "Tell us why", onClick: () => openCommandBar("I don't like this because of the ") } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Popover onOpenChange={(o) => o && void loadCollections()}>
        <PopoverTrigger asChild>
          <Button size="lg" className="rounded-full px-5" aria-label={saved ? "Saved — choose collections" : "Save to a collection"}>
            <Heart className={cn(saved && "fill-current")} /> {saved ? "Saved" : "Save"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-1.5">
          {!collections ? (
            <div className="grid h-20 place-items-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul>
              {collections.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => void saveTo(c)} disabled={busy === c.id} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{c.name}</span>
                    {busy === c.id ? <Loader2 className="size-4 animate-spin" /> : inCollections.includes(c.id) && <Check className="size-4 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <Button size="lg" variant="outline" className="rounded-full" onClick={() => compare.toggle(propertyId, "property")} aria-pressed={compare.has(propertyId)}>
        <GitCompareArrows /> {compare.has(propertyId) ? "Comparing" : "Compare"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="rounded-full"
        onClick={() => {
          track({ type: "find_similar", propertyId, sourceSurface: "property" }).catch(() => undefined);
          router.push(`/search?similar=${propertyId}`);
        }}
      >
        <Copy /> Find similar
      </Button>
      <div className="flex gap-1">
        <Button size="icon-lg" variant={reaction === "like" ? "secondary" : "ghost"} className="rounded-full" onClick={() => void react("like")} disabled={busy !== null} aria-label="I like this home" aria-pressed={reaction === "like"}>
          <ThumbsUp className={cn(reaction === "like" && "text-like")} />
        </Button>
        <Button size="icon-lg" variant={reaction === "dislike" ? "secondary" : "ghost"} className="rounded-full" onClick={() => void react("dislike")} disabled={busy !== null} aria-label="Not for me" aria-pressed={reaction === "dislike"}>
          <ThumbsDown className={cn(reaction === "dislike" && "text-nope")} />
        </Button>
        <Button size="icon-lg" variant="ghost" className="rounded-full" onClick={() => openCommandBar(reaction === "dislike" ? "I don't like this because of the " : "Why do you think I would like this?")} aria-label="Tell SwipeHome why">
          <MessageSquareText />
        </Button>
      </div>
    </div>
  );
}
