"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import { cn } from "@/lib/utils";
import { formatCompactPrice } from "@/lib/utils/format";
import type { PropertyCardData } from "@/models/card";

export default function MapboxMap({ token, properties, selectedId, onSelect }: { token: string; properties: PropertyCardData[]; selectedId?: string; onSelect: (id: string) => void }) {
  const selected = properties.find((p) => p.id === selectedId);
  return (
    <Map
      mapboxAccessToken={token}
      initialViewState={{ latitude: selected?.latitude ?? 40.71, longitude: selected?.longitude ?? -73.96, zoom: selected ? 13 : 10.3 }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {properties.map((p) => (
        <Marker key={p.id} latitude={p.latitude} longitude={p.longitude} anchor="bottom" onClick={(e) => { e.originalEvent.stopPropagation(); onSelect(p.id); }}>
          <button
            type="button"
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold shadow ring-1 ring-black/10 tabular",
              p.id === selectedId ? "bg-foreground text-background" : (p.match?.percent ?? 0) >= 80 ? "bg-primary text-primary-foreground" : "bg-background",
            )}
            aria-label={`${p.headline}, ${formatCompactPrice(p.price)}`}
          >
            {formatCompactPrice(p.price)}
          </button>
        </Marker>
      ))}
    </Map>
  );
}
