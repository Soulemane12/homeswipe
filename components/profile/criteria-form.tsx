"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ChoiceChip } from "@/components/onboarding/choice-chip";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { formatCompactPrice } from "@/lib/utils/format";
import { BOROUGHS, PROPERTY_TYPES, PROPERTY_TYPE_LABEL } from "@/models/property";
import type { ExplicitPreferences, HardConstraints } from "@/models/user";

const BUDGETS = [600_000, 800_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 3_000_000];

/** Hard constraints editor. These are never changed by the harness — only by the user. */
export function CriteriaForm({ constraints: initial, explicit }: { constraints: HardConstraints; explicit: ExplicitPreferences }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [saving, setSaving] = useState(false);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/onboarding", { body: { constraints: c, explicit } });
      toast("Criteria saved", { description: "New recommendations will respect these limits." });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Boroughs</legend>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip selected={c.boroughs.length === 0} onClick={() => setC({ ...c, boroughs: [] })}>
            All NYC
          </ChoiceChip>
          {BOROUGHS.map((b) => (
            <ChoiceChip key={b} selected={c.boroughs.includes(b)} onClick={() => setC({ ...c, boroughs: toggle(c.boroughs, b) })}>
              {b}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Maximum budget</legend>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <ChoiceChip key={b} selected={c.maxPrice === b} onClick={() => setC({ ...c, maxPrice: b })}>
              {formatCompactPrice(b)}
            </ChoiceChip>
          ))}
          <ChoiceChip selected={c.maxPrice === undefined} onClick={() => setC({ ...c, maxPrice: undefined })}>
            No max
          </ChoiceChip>
        </div>
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Minimum bedrooms
          <select className="h-10 rounded-lg border bg-background px-3 font-normal" value={c.minBedrooms} onChange={(e) => setC({ ...c, minBedrooms: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any (studio+)" : `${n}+`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Minimum bathrooms
          <select className="h-10 rounded-lg border bg-background px-3 font-normal" value={c.minBathrooms} onChange={(e) => setC({ ...c, minBathrooms: Number(e.target.value) })}>
            {[0, 1, 1.5, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any" : `${n}+`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Home types</legend>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((t) => (
            <ChoiceChip key={t} selected={c.propertyTypes.includes(t)} onClick={() => setC({ ...c, propertyTypes: toggle(c.propertyTypes, t) })}>
              {PROPERTY_TYPE_LABEL[t]}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>
      <Button onClick={() => void save()} disabled={saving} className="rounded-full px-5">
        {saving && <Loader2 className="animate-spin" />} Save criteria
      </Button>
    </div>
  );
}
