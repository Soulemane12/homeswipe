"use client";

import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCompactPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { BOROUGHS, PROPERTY_TYPES, PROPERTY_TYPE_LABEL } from "@/models/property";
import type { FilterState } from "./filter-state";

const PRICES = [400_000, 600_000, 800_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000];
const FEATURE_OPTIONS: [string, string][] = [
  ["natural_light", "Natural light"],
  ["outdoor_space", "Outdoor space"],
  ["balcony", "Balcony"],
  ["parking", "Parking"],
  ["doorman", "Doorman"],
  ["elevator", "Elevator"],
  ["in_unit_laundry", "In-unit laundry"],
  ["hardwood", "Hardwood"],
  ["open_kitchen", "Open kitchen"],
  ["near_transit", "Near transit"],
  ["water_views", "Water views"],
  ["home_office", "Home office"],
];

const selectClass = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

function NumberSelect({ label, value, options, onChange, format }: { label: string; value?: number; options: number[]; onChange: (v?: number) => void; format: (n: number) => string }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select className={selectClass} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Section({ title, summary, active, layout, children, onClear }: { title: string; summary: string; active: boolean; layout: "inline" | "stacked"; children: React.ReactNode; onClear: () => void }) {
  if (layout === "stacked") {
    return (
      <fieldset className="border-b py-4">
        <legend className="mb-2 text-sm font-medium">{title}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("rounded-full", active && "border-primary bg-accent/60")}>
          {active ? summary : title} <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-3">
          {children}
          {active && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X /> Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Explicit search filters. These always override anything parsed from the natural-language query. */
export function FilterControls({ filters, onChange, layout }: { filters: FilterState; onChange: (f: FilterState) => void; layout: "inline" | "stacked" }) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });
  const priceSummary =
    filters.minPrice && filters.maxPrice
      ? `${formatCompactPrice(filters.minPrice)}–${formatCompactPrice(filters.maxPrice)}`
      : filters.maxPrice
        ? `Under ${formatCompactPrice(filters.maxPrice)}`
        : filters.minPrice
          ? `Over ${formatCompactPrice(filters.minPrice)}`
          : "Price";
  const moreActive = Boolean(filters.minSqft || filters.maxHoa !== undefined || filters.minYearBuilt || filters.features.length);
  const placeCount = filters.boroughs.length + filters.neighborhoods.length;

  return (
    <>
      <Section
        title="Location"
        summary={filters.neighborhoods.length ? `${filters.neighborhoods.length} neighborhoods` : filters.boroughs.join(", ")}
        active={placeCount > 0 || filters.excludeNeighborhoods.length > 0}
        layout={layout}
        onClear={() => set({ boroughs: [], neighborhoods: [], excludeNeighborhoods: [] })}
      >
        <div className="grid">
          {BOROUGHS.map((b) => (
            <Check key={b} checked={filters.boroughs.includes(b)} onChange={() => set({ boroughs: toggle(filters.boroughs, b) })}>
              {b}
            </Check>
          ))}
        </div>
        {filters.neighborhoods.length > 0 && <p className="px-2 text-xs text-muted-foreground">Neighborhoods: {filters.neighborhoods.join(", ")}</p>}
        {filters.excludeNeighborhoods.length > 0 && <p className="px-2 text-xs text-muted-foreground">Excluding: {filters.excludeNeighborhoods.join(", ")}</p>}
      </Section>
      <Section title="Price" summary={priceSummary} active={Boolean(filters.minPrice || filters.maxPrice)} layout={layout} onClear={() => set({ minPrice: undefined, maxPrice: undefined })}>
        <div className="grid grid-cols-2 gap-2">
          <NumberSelect label="Min" value={filters.minPrice} options={PRICES} onChange={(v) => set({ minPrice: v })} format={formatCompactPrice} />
          <NumberSelect label="Max" value={filters.maxPrice} options={PRICES} onChange={(v) => set({ maxPrice: v })} format={formatCompactPrice} />
        </div>
      </Section>
      <Section
        title="Beds & baths"
        summary={[filters.minBedrooms ? `${filters.minBedrooms}+ bd` : null, filters.minBathrooms ? `${filters.minBathrooms}+ ba` : null].filter(Boolean).join(" · ")}
        active={Boolean(filters.minBedrooms || filters.minBathrooms)}
        layout={layout}
        onClear={() => set({ minBedrooms: undefined, minBathrooms: undefined })}
      >
        <div className="grid grid-cols-2 gap-2">
          <NumberSelect label="Bedrooms" value={filters.minBedrooms} options={[1, 2, 3, 4, 5]} onChange={(v) => set({ minBedrooms: v })} format={(n) => `${n}+`} />
          <NumberSelect label="Bathrooms" value={filters.minBathrooms} options={[1, 1.5, 2, 3]} onChange={(v) => set({ minBathrooms: v })} format={(n) => `${n}+`} />
        </div>
      </Section>
      <Section
        title="Home type"
        summary={filters.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(", ")}
        active={filters.propertyTypes.length > 0}
        layout={layout}
        onClear={() => set({ propertyTypes: [] })}
      >
        <div className="grid">
          {PROPERTY_TYPES.map((t) => (
            <Check key={t} checked={filters.propertyTypes.includes(t)} onChange={() => set({ propertyTypes: toggle(filters.propertyTypes, t) })}>
              {PROPERTY_TYPE_LABEL[t]}
            </Check>
          ))}
        </div>
      </Section>
      <Section title="More" summary="More filters" active={moreActive} layout={layout} onClear={() => set({ minSqft: undefined, maxHoa: undefined, minYearBuilt: undefined, features: [] })}>
        <div className="grid grid-cols-2 gap-2">
          <NumberSelect label="Min sqft" value={filters.minSqft} options={[500, 750, 1000, 1500, 2000, 2500]} onChange={(v) => set({ minSqft: v })} format={(n) => `${n.toLocaleString()}+`} />
          <NumberSelect label="Max HOA" value={filters.maxHoa} options={[0, 500, 1000, 1500, 2500]} onChange={(v) => set({ maxHoa: v })} format={(n) => (n === 0 ? "No HOA" : `$${n.toLocaleString()}/mo`)} />
          <NumberSelect label="Built after" value={filters.minYearBuilt} options={[1900, 1945, 1980, 2000, 2010, 2020]} onChange={(v) => set({ minYearBuilt: v })} format={(n) => String(n)} />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {FEATURE_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filters.features.includes(key)}
              onClick={() => set({ features: toggle(filters.features, key) })}
              className={cn("rounded-full border px-2.5 py-1 text-xs", filters.features.includes(key) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
