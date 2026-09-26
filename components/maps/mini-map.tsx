import Link from "next/link";
import { MapPin } from "lucide-react";

/** Static location preview: Mapbox Static Images when a token exists, otherwise a quiet placeholder. */
export function MiniMap({ lat, lng, label, propertyId, mapboxToken }: { lat: number; lng: number; label: string; propertyId: string; mapboxToken?: string }) {
  const src = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2f5d50(${lng},${lat})/${lng},${lat},13.5,0/640x320@2x?access_token=${mapboxToken}`
    : null;
  return (
    <Link href={`/map?focus=${propertyId}`} prefetch={false} className="group relative block aspect-[2/1] overflow-hidden rounded-2xl border bg-secondary">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- static map image; not worth optimizing
        <img src={src} alt={`Map showing ${label}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_center,var(--accent),transparent_70%)] text-center">
          <MapPin className="size-6 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">{label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>
      )}
      <span className="absolute right-3 bottom-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow-sm group-hover:bg-background">Open map</span>
    </Link>
  );
}
