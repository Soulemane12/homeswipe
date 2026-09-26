"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { track } from "@/lib/client/track";
import { cn } from "@/lib/utils";
import { PropertyImage } from "./property-image";

export function PropertyGallery({ propertyId, media }: { propertyId: string; media: { url: string; alt: string }[] }) {
  const [active, setActive] = useState(0);
  const viewed = useRef(new Set<number>([0]));
  const reported = useRef(false);

  function show(i: number) {
    const next = (i + media.length) % media.length;
    setActive(next);
    viewed.current.add(next);
    // One weak "image_view" signal once the user browses beyond a couple of photos.
    if (!reported.current && viewed.current.size >= 3) {
      reported.current = true;
      track({ type: "image_view", propertyId, photosViewed: viewed.current.size, sourceSurface: "property" }).catch(() => undefined);
    }
  }

  if (media.length === 0) {
    return (
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
        <PropertyImage alt="No photos available" sizes="100vw" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted md:aspect-[16/9]">
        <PropertyImage key={media[active].url} src={media[active].url} alt={media[active].alt} sizes="(max-width: 1024px) 100vw, 66vw" priority />
        {media.length > 1 && (
          <>
            <button type="button" onClick={() => show(active - 1)} className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow" aria-label="Previous photo">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => show(active + 1)} className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow" aria-label="Next photo">
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white tabular">
              {active + 1} / {media.length}
            </span>
          </>
        )}
      </div>
      {media.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {media.map((m, i) => (
            <button
              key={m.url + i}
              type="button"
              onClick={() => show(i)}
              className={cn("relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-background", i === active && "ring-2 ring-primary")}
              aria-label={`Show photo ${i + 1}: ${m.alt}`}
              aria-current={i === active}
            >
              <PropertyImage src={m.url} alt="" sizes="96px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
