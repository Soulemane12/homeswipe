import Link from "next/link";
import { PropertyImage } from "@/components/property/property-image";
import { cn } from "@/lib/utils";
import type { DnaTrait } from "@/services/preferences/dna";
import { CorrectionControl } from "./correction-control";

function ConfidenceMeter({ value }: { value: number }) {
  const label = value >= 0.8 ? "High confidence" : value >= 0.5 ? "Medium confidence" : "Low confidence";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`${Math.round(value * 100)}% confidence`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} className={cn("h-2.5 w-1 rounded-full", value >= t ? "bg-primary" : "bg-border")} />
        ))}
      </span>
      {label}
    </span>
  );
}

export function TraitRow({ trait, tone }: { trait: DnaTrait; tone: "positive" | "negative" }) {
  const width = Math.round(Math.min(1, Math.abs(trait.strength) / 0.8) * 100);
  return (
    <li className="flex items-center gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[17px] font-medium">{trait.label}</span>
          <span className={cn("text-sm", tone === "positive" ? "text-primary" : "text-nope")}>{trait.strengthLabel}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
            {trait.source === "inferred" ? "Learned" : trait.source === "correction" ? "You corrected" : "You said"}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-label={`${trait.label} strength`}>
            <div className={cn("h-full rounded-full", tone === "positive" ? "bg-primary" : "bg-nope")} style={{ width: `${width}%` }} />
          </div>
          <ConfidenceMeter value={trait.confidence} />
        </div>
      </div>
      {trait.evidence.homes.length > 0 && (
        <div className="hidden -space-x-2 sm:flex" aria-label={`Based on ${trait.evidence.positive + trait.evidence.negative} homes`}>
          {trait.evidence.homes.slice(0, 3).map((h) => (
            <Link key={h.id} href={`/property/${h.id}`} prefetch={false} className="relative size-9 overflow-hidden rounded-full ring-2 ring-background" title={h.headline}>
              <PropertyImage src={h.image} alt={h.headline} sizes="36px" />
            </Link>
          ))}
        </div>
      )}
      <CorrectionControl dimension={trait.dimension} label={trait.label} direction={tone} current={trait.stance} />
    </li>
  );
}
