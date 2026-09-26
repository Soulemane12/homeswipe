"use client";

import { cn } from "@/lib/utils";
import { formatCompactPrice } from "@/lib/utils/format";
import type { PropertyCardData } from "@/models/card";

const BOUNDS = { minLat: 40.49, maxLat: 40.92, minLng: -74.27, maxLng: -73.7 };
const W = 800;
const H = 820;
const LABELS: { name: string; lat: number; lng: number }[] = [
  { name: "Manhattan", lat: 40.79, lng: -73.97 },
  { name: "Brooklyn", lat: 40.65, lng: -73.95 },
  { name: "Queens", lat: 40.73, lng: -73.84 },
  { name: "Bronx", lat: 40.86, lng: -73.88 },
  { name: "Staten Island", lat: 40.58, lng: -74.15 },
];

function project(lat: number, lng: number): [number, number] {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
  return [x, y];
}

/** Map fallback without tiles: listings projected onto NYC coordinates, still fully interactive. */
export function SvgMap({ properties, selectedId, onSelect }: { properties: PropertyCardData[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Map of listings across New York City">
      <rect width={W} height={H} fill="var(--secondary)" />
      <g stroke="var(--border)" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={(i * W) / 8} y1={0} x2={(i * W) / 8} y2={H} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i * H) / 8} x2={W} y2={(i * H) / 8} />
        ))}
      </g>
      {LABELS.map((l) => {
        const [x, y] = project(l.lat, l.lng);
        return (
          <text key={l.name} x={x} y={y} textAnchor="middle" className="fill-muted-foreground font-display" fontSize="26" opacity="0.55">
            {l.name}
          </text>
        );
      })}
      {properties.map((p) => {
        const [x, y] = project(p.latitude, p.longitude);
        const selected = p.id === selectedId;
        const strong = (p.match?.percent ?? 0) >= 80;
        return (
          <g key={p.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => onSelect(p.id)} role="button" tabIndex={0} aria-label={`${p.headline}, ${formatCompactPrice(p.price)}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(p.id)}>
            <circle r={selected ? 11 : 7} className={cn(selected ? "fill-foreground" : strong ? "fill-primary" : "fill-chart-2")} stroke="white" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}
