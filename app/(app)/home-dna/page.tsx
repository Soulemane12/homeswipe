import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import { CorrectionControl } from "@/components/preference/correction-control";
import { TraitRow } from "@/components/preference/trait-row";
import { Button } from "@/components/ui/button";
import { getCurrentUserId } from "@/lib/auth/session";
import { formatCompactPrice } from "@/lib/utils/format";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import { getHomeDna } from "@/services/preferences/dna";

export const metadata: Metadata = { title: "Home DNA" };

export default async function HomeDnaPage() {
  const dna = await getHomeDna(await getCurrentUserId());
  const c = dna.constraints;
  const constraintBits = [
    c.maxPrice ? `Up to ${formatCompactPrice(c.maxPrice)}` : "Any budget",
    c.minBedrooms ? `${c.minBedrooms}+ bedrooms` : null,
    c.minBathrooms ? `${c.minBathrooms}+ baths` : null,
    c.propertyTypes.length ? c.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(", ") : null,
    c.boroughs.length ? c.boroughs.join(", ") : "All of NYC",
  ].filter(Boolean);
  const empty = dna.positives.length === 0 && dna.negatives.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-6 md:pt-12">
      <p className="text-sm font-medium tracking-wide text-primary uppercase">Your Home DNA</p>
      <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{dna.summary}</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Learned from {dna.interactionCount} {dna.interactionCount === 1 ? "interaction" : "interactions"}
        {dna.updatedAt && ` · updated ${dna.updatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
      </p>
      {dna.includesSimulated && (
        <p className="mt-3 inline-block rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
          Includes simulated interactions from the lab. Reset the demo in /lab to start fresh.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {constraintBits.map((b) => (
          <span key={b} className="rounded-full border px-3 py-1">
            {b}
          </span>
        ))}
        <Link href="/profile" className="ml-1 text-sm font-medium underline-offset-4 hover:underline">
          Edit criteria
        </Link>
      </div>

      {empty ? (
        <div className="mt-12 rounded-3xl border p-10 text-center">
          <p className="font-display text-2xl">Nothing learned yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Swipe through a handful of homes. SwipeHome updates your Home DNA every few meaningful reactions.</p>
          <Button asChild className="mt-5 rounded-full">
            <Link href="/swipe">Start swiping</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-12 grid gap-12">
          {dna.positives.length > 0 && (
            <section aria-labelledby="loves">
              <h2 id="loves" className="font-display text-3xl">What you love</h2>
              <ul className="mt-2 divide-y">
                {dna.positives.map((t) => (
                  <TraitRow key={t.dimension} trait={t} tone="positive" />
                ))}
              </ul>
            </section>
          )}
          {dna.negatives.length > 0 && (
            <section aria-labelledby="avoid">
              <h2 id="avoid" className="font-display text-3xl">What you avoid</h2>
              <ul className="mt-2 divide-y">
                {dna.negatives.map((t) => (
                  <TraitRow key={t.dimension} trait={t} tone="negative" />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {dna.learning.length > 0 && (
        <section aria-labelledby="learning" className="mt-12 rounded-3xl bg-secondary/70 p-6">
          <h2 id="learning" className="flex items-center gap-2 font-display text-2xl">
            <FlaskConical className="size-5 text-primary" aria-hidden="true" /> Still learning
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">SwipeHome is deliberately showing you a few homes that vary on these to find out how you feel.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {dna.learning.map((l) => (
              <li key={l.dimension} className="flex items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3 text-sm">
                {l.label}
                <CorrectionControl dimension={l.dimension} label={l.label} direction="positive" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {dna.recentShifts.length > 0 && (
        <section aria-labelledby="shifts" className="mt-12">
          <h2 id="shifts" className="font-display text-2xl">Recently changing</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {dna.recentShifts.map((s) => (
              <li key={s.dimension} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                {s.direction === "up" ? <TrendingUp className="size-4 text-like" aria-hidden="true" /> : <TrendingDown className="size-4 text-nope" aria-hidden="true" />}
                {s.direction === "up" ? "Warming to" : "Cooling on"} {s.label.toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dna.dismissed.length > 0 && (
        <section aria-labelledby="dismissed" className="mt-12">
          <h2 id="dismissed" className="font-display text-2xl">You said these don&apos;t matter</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {dna.dismissed.map((t) => (
              <li key={t.dimension} className="flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm text-muted-foreground">
                {t.label}
                <CorrectionControl dimension={t.dimension} label={t.label} direction={t.strength < 0 ? "negative" : "positive"} current="not_important" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {dna.learnings.length > 0 && (
        <section aria-labelledby="experiments" className="mt-12 border-t pt-8">
          <h2 id="experiments" className="text-sm font-semibold">What SwipeHome learned from its experiments</h2>
          <ul className="mt-3 space-y-2 text-sm text-foreground/80">
            {dna.learnings.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
