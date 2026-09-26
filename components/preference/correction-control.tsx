"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/client/api";

type Stance = "important" | "neutral" | "not_important";

/** Lets the user correct a belief; the correction is stored as high-confidence explicit evidence. */
export function CorrectionControl({ dimension, label, direction, current }: { dimension: string; label: string; direction: "positive" | "negative"; current?: Stance }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Stance | null>(null);
  const options: { stance: Stance; label: string }[] =
    direction === "positive"
      ? [
          { stance: "important", label: "Important" },
          { stance: "neutral", label: "Neutral" },
          { stance: "not_important", label: "Not important" },
        ]
      : [
          { stance: "important", label: "Yes, avoid it" },
          { stance: "neutral", label: "Mild preference" },
          { stance: "not_important", label: "Doesn't matter" },
        ];

  async function choose(stance: Stance) {
    setPending(stance);
    try {
      await apiFetch("/api/preferences/correct", { body: { corrections: [{ dimension, stance, direction }], sourceSurface: "home_dna" } });
      setOpen(false);
      toast("Home DNA updated", { description: "Your correction outweighs anything HomeSwipe inferred." });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={`Correct ${label}`}>
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-sm">
          HomeSwipe thinks you {direction === "positive" ? "care about" : "avoid"} <span className="font-medium">{label.toLowerCase()}</span>.
        </p>
        <div className="mt-3 grid gap-1.5">
          {options.map((o) => (
            <Button key={o.stance} variant={current === o.stance ? "default" : "outline"} className="justify-start" disabled={pending !== null} onClick={() => void choose(o.stance)}>
              {pending === o.stance && <Loader2 className="animate-spin" />}
              {o.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
