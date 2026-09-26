"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Heart, Info, Loader2, Star, X } from "lucide-react";
import { JudgeChip } from "@/components/property/judge-chip";
import { MatchBadge } from "@/components/property/match-badge";
import { PropertyFacts } from "@/components/property/property-card";
import { PropertyImage } from "@/components/property/property-image";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { track } from "@/lib/client/track";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/models/card";

type Decision = "like" | "dislike" | "super_like";
const COMMIT_PX = 110;

interface FeedResponse {
  items: PropertyCardData[];
  exhausted: boolean;
}

export function SwipeDeck({ judge }: { judge: boolean }) {
  const [queue, setQueue] = useState<PropertyCardData[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exit, setExit] = useState<Decision | null>(null);
  const [photo, setPhoto] = useState(0);
  const fetching = useRef(false);
  const started = useRef(false);
  const shownAt = useRef(0);
  const photosSeen = useRef(new Set<number>([0]));
  const start = useRef<{ x: number; y: number } | null>(null);
  const swipes = useRef(0);

  const fetchMore = useCallback((exclude: string[]) => {
    if (fetching.current) return;
    fetching.current = true;
    apiFetch<FeedResponse>("/api/recommendations/next", { body: { limit: 5, surface: "swipe", excludeIds: exclude } })
      .then((res) => {
        setQueue((prev) => [...prev, ...res.items.filter((i) => !prev.some((p) => p.id === i.id))]);
        if (res.items.length === 0) setExhausted(true);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        fetching.current = false;
        setLoading(false);
      });
  }, []);

  // Initial batch; the ref guard avoids a duplicate request (and duplicate impressions) under Strict Mode.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchMore([]);
  }, [fetchMore]);

  const current = queue[index];

  // The dwell clock starts when a card becomes the top card.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.id]);
  const next = queue[index + 1];

  const decide = useCallback(
    (decision: Decision) => {
      if (!current || exit) return;
      const dwellMs = Date.now() - shownAt.current;
      const photosViewed = photosSeen.current.size;
      setExit(decision);
      track({ type: decision, propertyId: current.id, impressionId: current.impressionId, dwellMs, photosViewed, sourceSurface: "swipe" })
        .then((res) => {
          swipes.current++;
          if (res.preferencesUpdating) toast("SwipeHome updated what it knows about your preferences.", { duration: 2500 });
          if (judge && res.resolved) {
            toast(`Predicted ${res.resolved.predictedLabel} · actual ${res.resolved.actualLabel}`, {
              description: res.resolved.correct ? "Prediction correct" : "Prediction missed — logged for the harness",
              duration: 1800,
            });
          }
        })
        .catch((e: Error) => toast.error(e.message));
      // Prefetch the next batch before the queue runs dry.
      if (!exhausted && queue.length - (index + 1) <= 2) fetchMore(queue.map((q) => q.id));
      window.setTimeout(() => {
        setIndex((i) => i + 1);
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
        setPhoto(0);
        photosSeen.current = new Set([0]);
      }, 260);
    },
    [current, exit, judge, exhausted, queue, index, fetchMore],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") decide("dislike");
      if (e.key === "ArrowRight") decide("like");
      if (e.key === "ArrowUp") decide("super_like");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  function onPointerDown(e: React.PointerEvent) {
    if (exit) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!start.current || !current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
      // Tap: left/right side cycles photos.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const forward = e.clientX - rect.left > rect.width / 2;
      const count = current.media.length;
      if (count > 1) {
        const nextPhoto = (photo + (forward ? 1 : count - 1)) % count;
        setPhoto(nextPhoto);
        photosSeen.current.add(nextPhoto);
      }
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    if (dx > COMMIT_PX) decide("like");
    else if (dx < -COMMIT_PX) decide("dislike");
    else if (dy < -COMMIT_PX * 1.2) decide("super_like");
    else setDrag({ x: 0, y: 0, active: false });
  }

  if (loading) {
    return (
      <div className="grid h-[70vh] place-items-center" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!current) {
    return (
      <div className="mx-auto grid h-[65vh] max-w-sm place-items-center text-center">
        <div>
          <p className="font-display text-3xl">{error ? "Something went wrong" : "You're all caught up"}</p>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "You've seen every home that fits your criteria. Your preferences are saved — check your Home DNA or widen your search."}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/home-dna">Home DNA</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/profile">Edit criteria</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const rotation = drag.x / 18;
  const exitTransform =
    exit === "like" ? "translate(140%, 10%) rotate(18deg)" : exit === "dislike" ? "translate(-140%, 10%) rotate(-18deg)" : exit === "super_like" ? "translate(0, -130%)" : null;
  const likeOpacity = Math.max(0, Math.min(1, drag.x / COMMIT_PX));
  const nopeOpacity = Math.max(0, Math.min(1, -drag.x / COMMIT_PX));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <div className="relative aspect-[3/4] w-full max-h-[68vh]">
        {next && (
          <div className="absolute inset-0 scale-[0.96] overflow-hidden rounded-3xl bg-muted opacity-80" aria-hidden="true">
            <PropertyImage src={next.media[0]?.url} alt="" sizes="(max-width: 640px) 100vw, 448px" />
          </div>
        )}
        <div
          role="group"
          aria-roledescription="Home card"
          aria-label={`${current.headline}, ${formatPrice(current.price)}, ${current.neighborhood}`}
          className={cn("absolute inset-0 touch-none overflow-hidden rounded-3xl bg-muted shadow-xl select-none", !drag.active && "transition-transform duration-300 ease-out")}
          style={{ transform: exitTransform ?? `translate(${drag.x}px, ${drag.y * 0.25}px) rotate(${rotation}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null;
            setDrag({ x: 0, y: 0, active: false });
          }}
        >
          <PropertyImage key={`${current.id}-${photo}`} src={current.media[photo]?.url} alt={current.media[photo]?.alt ?? current.headline} sizes="(max-width: 640px) 100vw, 448px" priority />
          {current.media.length > 1 && (
            <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden="true">
              {current.media.map((m, i) => (
                <span key={m.url + i} className={cn("h-1 flex-1 rounded-full", i === photo ? "bg-white" : "bg-white/40")} />
              ))}
            </div>
          )}
          <span className="absolute top-8 left-6 -rotate-12 rounded-lg border-4 border-like px-3 py-1 text-2xl font-bold text-like" style={{ opacity: likeOpacity }} aria-hidden="true">
            LIKE
          </span>
          <span className="absolute top-8 right-6 rotate-12 rounded-lg border-4 border-nope px-3 py-1 text-2xl font-bold text-nope" style={{ opacity: nopeOpacity }} aria-hidden="true">
            NOPE
          </span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 pt-24 text-white">
            <div className="flex items-center gap-2">
              {current.match && <MatchBadge percent={current.match.percent} size="sm" />}
              {current.judge && <JudgeChip judge={current.judge} />}
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular">{formatPrice(current.price)}</p>
            <p className="text-[15px] font-medium">{current.headline}</p>
            <p className="text-sm text-white/80">
              {current.neighborhood}, {current.borough}
            </p>
            <PropertyFacts p={current} className="text-white/80" />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-5" role="toolbar" aria-label="Swipe actions">
        <Button variant="outline" className="size-16 rounded-full border-2 shadow-sm [&_svg:not([class*='size-'])]:size-7" onClick={() => decide("dislike")} aria-label="Dislike (left arrow)">
          <X className="text-nope" />
        </Button>
        <Button variant="outline" className="size-12 rounded-full border-2 shadow-sm [&_svg:not([class*='size-'])]:size-5" onClick={() => decide("super_like")} aria-label="Super like (up arrow)">
          <Star className="fill-super text-super" />
        </Button>
        <Button variant="outline" className="size-16 rounded-full border-2 shadow-sm [&_svg:not([class*='size-'])]:size-7" onClick={() => decide("like")} aria-label="Like (right arrow)">
          <Heart className="fill-like text-like" />
        </Button>
        <Button asChild variant="ghost" className="size-12 rounded-full" aria-label="Open details">
          <Link href={`/property/${current.id}`} prefetch={false}>
            <Info className="size-5" />
          </Link>
        </Button>
      </div>
      <p className="mt-4 hidden text-xs text-muted-foreground md:block">Use ← → to swipe, ↑ to super like. Tap the photo to browse.</p>
    </div>
  );
}
