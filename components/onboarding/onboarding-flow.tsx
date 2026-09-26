"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/client/api";
import { formatCompactPrice } from "@/lib/utils/format";
import { BOROUGHS, PROPERTY_TYPES, PROPERTY_TYPE_LABEL, type Borough, type ListingType, type PropertyType } from "@/models/property";
import type { HardConstraints } from "@/models/user";
import { ChoiceChip } from "./choice-chip";

const BUDGETS = [600_000, 800_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 3_000_000];
const WANT = [
  ["natural_light", "Natural light"],
  ["open_kitchen", "Modern open kitchen"],
  ["outdoor_space", "Outdoor space"],
  ["balcony", "Balcony"],
  ["parking", "Parking"],
  ["near_transit", "Near transit"],
  ["elevator", "Elevator"],
  ["doorman", "Doorman"],
  ["hardwood", "Hardwood floors"],
  ["in_unit_laundry", "In-unit laundry"],
  ["quiet", "Quiet street"],
] as const;
const AVOID = [
  ["carpet", "Carpet"],
  ["dark_interior", "Dark interiors"],
  ["dated_kitchen", "Dated kitchens"],
  ["high_rise", "High-rises"],
] as const;

type Step = "transaction" | "location" | "budget" | "bedrooms" | "bathrooms" | "type" | "preferences";

export function OnboardingFlow({ initial, listingTypes }: { initial: { constraints: HardConstraints; positive: string[]; negative: string[] }; listingTypes: ListingType[] }) {
  const router = useRouter();
  const steps: Step[] = [...(listingTypes.length > 1 ? (["transaction"] as Step[]) : []), "location", "budget", "bedrooms", "bathrooms", "type", "preferences"];
  const [stepIndex, setStepIndex] = useState(0);
  const [constraints, setConstraints] = useState<HardConstraints>(initial.constraints);
  const [positive, setPositive] = useState<string[]>(initial.positive);
  const [negative, setNegative] = useState<string[]>(initial.negative);
  const [saving, setSaving] = useState(false);
  const step = steps[stepIndex];

  const set = <K extends keyof HardConstraints>(key: K, value: HardConstraints[K]) => setConstraints((c) => ({ ...c, [key]: value }));
  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function finish() {
    setSaving(true);
    try {
      await apiFetch("/api/onboarding", { body: { constraints, explicit: { positive, negative } } });
      router.push("/swipe");
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }
  const nextStep = () => (stepIndex === steps.length - 1 ? void finish() : setStepIndex((i) => i + 1));

  const titles: Record<Step, [string, string]> = {
    transaction: ["Are you buying or renting?", "We'll only show listings of that kind."],
    location: ["Where are you looking?", "Pick one or more boroughs — or search all of NYC."],
    budget: ["What's your maximum budget?", "This is a hard limit. SwipeHome will never show you homes above it."],
    bedrooms: ["How many bedrooms, at minimum?", "Another hard constraint — applied before any personalization."],
    bathrooms: ["And bathrooms?", ""],
    type: ["What kind of home?", "Leave empty to see every type."],
    preferences: ["Anything you already know you want?", "Optional. SwipeHome will learn the rest from what you like."],
  };
  const [title, subtitle] = titles[step];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Progress value={((stepIndex + 1) / steps.length) * 100} className="h-1" aria-label={`Step ${stepIndex + 1} of ${steps.length}`} />
      <div className="mt-10 min-h-[22rem]">
        <h1 className="font-display text-4xl leading-tight md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        <div className="mt-8 flex flex-wrap gap-2.5">
          {step === "transaction" &&
            listingTypes.map((t) => (
              <ChoiceChip key={t} selected={constraints.listingType === t} onClick={() => set("listingType", t)}>
                {t === "sale" ? "Buy" : "Rent"}
              </ChoiceChip>
            ))}
          {step === "location" && (
            <>
              <ChoiceChip selected={constraints.boroughs.length === 0} onClick={() => set("boroughs", [])}>
                Anywhere in NYC
              </ChoiceChip>
              {BOROUGHS.map((b) => (
                <ChoiceChip key={b} selected={constraints.boroughs.includes(b)} onClick={() => set("boroughs", toggle<Borough>(constraints.boroughs, b))}>
                  {b}
                </ChoiceChip>
              ))}
            </>
          )}
          {step === "budget" && (
            <>
              {BUDGETS.map((b) => (
                <ChoiceChip key={b} selected={constraints.maxPrice === b} onClick={() => set("maxPrice", b)}>
                  Up to {formatCompactPrice(b)}
                </ChoiceChip>
              ))}
              <ChoiceChip selected={constraints.maxPrice === undefined} onClick={() => set("maxPrice", undefined)}>
                No maximum
              </ChoiceChip>
            </>
          )}
          {step === "bedrooms" &&
            [0, 1, 2, 3, 4].map((n) => (
              <ChoiceChip key={n} selected={constraints.minBedrooms === n} onClick={() => set("minBedrooms", n)}>
                {n === 0 ? "Studio or more" : `${n}+ bedrooms`}
              </ChoiceChip>
            ))}
          {step === "bathrooms" &&
            [0, 1, 1.5, 2, 3].map((n) => (
              <ChoiceChip key={n} selected={constraints.minBathrooms === n} onClick={() => set("minBathrooms", n)}>
                {n === 0 ? "Any" : `${n}+ baths`}
              </ChoiceChip>
            ))}
          {step === "type" &&
            PROPERTY_TYPES.map((t) => (
              <ChoiceChip key={t} selected={constraints.propertyTypes.includes(t)} onClick={() => set("propertyTypes", toggle<PropertyType>(constraints.propertyTypes, t))}>
                {PROPERTY_TYPE_LABEL[t]}
              </ChoiceChip>
            ))}
          {step === "preferences" && (
            <div className="w-full space-y-6">
              <fieldset>
                <legend className="mb-3 text-sm font-medium">I&apos;d love</legend>
                <div className="flex flex-wrap gap-2.5">
                  {WANT.map(([key, label]) => (
                    <ChoiceChip key={key} selected={positive.includes(key)} onClick={() => { setPositive(toggle(positive, key)); setNegative(negative.filter((n) => n !== key)); }}>
                      {label}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-3 text-sm font-medium">I&apos;d rather avoid</legend>
                <div className="flex flex-wrap gap-2.5">
                  {AVOID.map(([key, label]) => (
                    <ChoiceChip key={key} tone="avoid" selected={negative.includes(key)} onClick={() => { setNegative(toggle(negative, key)); setPositive(positive.filter((p) => p !== key)); }}>
                      {label}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      </div>
      <div className="mt-10 flex items-center justify-between border-t pt-6">
        <Button variant="ghost" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0 || saving}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex gap-2">
          {step === "preferences" && (
            <Button variant="ghost" onClick={() => void finish()} disabled={saving}>
              Skip
            </Button>
          )}
          <Button size="lg" className="rounded-full px-6" onClick={nextStep} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {stepIndex === steps.length - 1 ? "Start discovering" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
