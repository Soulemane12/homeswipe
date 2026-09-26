import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { MiniMap } from "@/components/maps/mini-map";
import { DetailTracker } from "@/components/property/detail-tracker";
import { MatchBadge } from "@/components/property/match-badge";
import { PropertyActions } from "@/components/property/property-actions";
import { PropertyCard } from "@/components/property/property-card";
import { PropertyGallery } from "@/components/property/property-gallery";
import { ScoreBreakdownBars } from "@/components/property/score-breakdown";
import { getCurrentUserId } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { isJudgeMode } from "@/lib/judge";
import { formatBaths, formatNumber, formatPrice } from "@/lib/utils/format";
import { PROPERTY_TYPE_LABEL } from "@/models/property";
import { getPropertyDetail } from "@/services/properties/detail";
import { similarHomes } from "@/services/search/similar";

export async function generateMetadata(props: PageProps<"/property/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const detail = await getPropertyDetail(await getCurrentUserId(), id);
  return { title: detail ? `${detail.property.headline} — ${detail.property.address.neighborhood}` : "Home not found" };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium tabular">{value}</dd>
    </div>
  );
}

export default async function PropertyPage(props: PageProps<"/property/[id]">) {
  const { id } = await props.params;
  const userId = await getCurrentUserId();
  const [detail, judge] = await Promise.all([getPropertyDetail(userId, id), isJudgeMode()]);
  if (!detail) notFound();
  const { property: p, card } = detail;
  const similar = await similarHomes(userId, id, 6);
  const media = p.media.filter((m) => m.type === "image").map((m) => ({ url: m.url, alt: m.alt ?? p.headline }));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
      <DetailTracker propertyId={p.id} />
      <Link href="/swipe" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to homes
      </Link>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10">
          <PropertyGallery propertyId={p.id} media={media} />

          <section aria-labelledby="about">
            <h2 id="about" className="font-display text-3xl">About this home</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-foreground/80">{p.description}</p>
            {p.features.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Features">
                {p.features.map((f) => (
                  <li key={f} className="rounded-full bg-secondary px-3 py-1 text-sm">
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="facts">
            <h2 id="facts" className="font-display text-3xl">Facts &amp; costs</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border p-5 sm:grid-cols-3 md:grid-cols-4">
              <Fact label="Price" value={formatPrice(p.financial.price)} />
              <Fact label="Est. monthly" value={p.financial.estimatedMonthly ? `${formatPrice(p.financial.estimatedMonthly)}/mo` : "—"} />
              <Fact label={p.facts.propertyType === "co-op" ? "Maintenance" : "HOA"} value={p.financial.hoa ? `${formatPrice(p.financial.hoa)}/mo` : "None"} />
              <Fact label="Property taxes" value={p.financial.taxesAnnual ? `${formatPrice(p.financial.taxesAnnual)}/yr` : p.facts.propertyType === "co-op" ? "In maintenance" : "—"} />
              <Fact label="Type" value={PROPERTY_TYPE_LABEL[p.facts.propertyType]} />
              <Fact label="Bedrooms" value={p.facts.bedrooms === 0 ? "Studio" : p.facts.bedrooms} />
              <Fact label="Bathrooms" value={formatBaths(p.facts.bathrooms)} />
              <Fact label="Interior" value={p.facts.sqft ? `${formatNumber(p.facts.sqft)} sqft` : "—"} />
              <Fact label="Year built" value={p.facts.yearBuilt ?? "—"} />
              <Fact label="Price / sqft" value={p.facts.sqft ? formatPrice(Math.round(p.financial.price / p.facts.sqft)) : "—"} />
              {p.facts.lotSize && <Fact label="Lot" value={`${formatNumber(p.facts.lotSize)} sqft`} />}
              <Fact label="Listed" value={p.listedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Estimated monthly assumes 20% down and a 6.5% 30-year fixed rate, plus HOA/maintenance and taxes.</p>
          </section>

          <section aria-labelledby="location">
            <h2 id="location" className="font-display text-3xl">Location</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.address.formatted} (approximate)</p>
            <div className="mt-4 max-w-2xl">
              <MiniMap lat={p.address.latitude} lng={p.address.longitude} label={`${p.address.neighborhood}, ${p.address.borough}`} propertyId={p.id} mapboxToken={env().NEXT_PUBLIC_MAPBOX_TOKEN} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            {card.match && <MatchBadge percent={card.match.percent} />}
            <p className="mt-3 text-4xl font-semibold tracking-tight tabular">{formatPrice(p.financial.price)}</p>
            <h1 className="mt-1 text-lg font-medium">{p.headline}</h1>
            <p className="text-sm text-muted-foreground">
              {p.address.neighborhood}, {p.address.borough} · {p.facts.bedrooms === 0 ? "Studio" : `${p.facts.bedrooms} bd`} · {formatBaths(p.facts.bathrooms)} ba{p.facts.sqft ? ` · ${formatNumber(p.facts.sqft)} sqft` : ""}
            </p>
            <div className="mt-5">
              <PropertyActions propertyId={p.id} saved={detail.saved} collectionIds={detail.collectionIds} reaction={detail.reaction} />
            </div>

            <div className="mt-6 border-t pt-5">
              <h2 className="text-sm font-semibold">Why this matches</h2>
              {card.match && card.match.reasons.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {card.match.reasons.map((r) => (
                    <li key={r} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 text-like" aria-hidden="true" /> {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">SwipeHome is still learning your taste — react to a few homes to see personal reasons here.</p>
              )}
              {card.match && card.match.tradeoffs.length > 0 && (
                <>
                  <h3 className="mt-4 text-sm font-semibold">Possible tradeoffs</h3>
                  <ul className="mt-2 space-y-1.5">
                    {card.match.tradeoffs.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-sm text-foreground/80">
                        <Minus className="size-4 text-nope" aria-hidden="true" /> {t}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {judge && (
              <div className="mt-6 border-t pt-5">
                <h2 className="font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">Judge · harness v{detail.policyVersion}</h2>
                <p className="mt-1 mb-3 font-mono text-xs">predicted like score {detail.predictedLikeScore.toFixed(3)} (uncalibrated)</p>
                <ScoreBreakdownBars breakdown={detail.breakdown} />
              </div>
            )}
          </div>
          <p className="mt-3 px-2 text-xs text-muted-foreground">Sample listing · {p.media[0]?.credit ?? "Photos via Unsplash"}</p>
        </aside>
      </div>

      {similar.results.length > 0 && (
        <section aria-labelledby="similar" className="mt-16">
          <div className="flex items-end justify-between">
            <h2 id="similar" className="font-display text-3xl">Homes like this</h2>
            <Link href={`/search?similar=${p.id}`} prefetch={false} className="text-sm font-medium underline-offset-4 hover:underline">
              See all
            </Link>
          </div>
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {similar.results.slice(0, 3).map((s) => (
              <PropertyCard key={s.id} property={s} surface="property" allowHide={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
