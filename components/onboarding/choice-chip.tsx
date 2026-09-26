"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChoiceChip({ selected, onClick, children, tone = "default" }: { selected: boolean; onClick: () => void; children: React.ReactNode; tone?: "default" | "avoid" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected
          ? tone === "avoid"
            ? "border-nope/50 bg-nope/10 text-foreground"
            : "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-foreground/30",
      )}
    >
      {selected && <Check className="size-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}
