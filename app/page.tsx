import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Brain, Hand, Home, RefreshCcw } from "lucide-react";
import { Logo } from "@/components/navigation/logo";
import { Button } from "@/components/ui/button";
import { unsplashUrl } from "@/lib/seed/image-library";

const STEPS = [
  { icon: Hand, title: "Swipe", body: "React to homes — a like, a pass, a save. Every reaction is a signal, and passive ones count for less." },
  { icon: Brain, title: "Learn", body: "SwipeHome builds your Home DNA: what you love, what you avoid, and what it's still unsure about." },
  { icon: RefreshCcw, title: "Adapt", body: "Before you see each home it predicts your reaction. It grades itself, and changes how it learns you when it's wrong." },
  { icon: Home, title: "Better homes", body: "Recommendations sharpen over time — within the budget and neighborhoods you set, never outside them." },
];

const HERO = [
  { id: "1600210492486-724fe5c67fb0", alt: "Bright living room with tall windows", tag: "Natural light", className: "left-[8%] top-[4%] w-[62%] rotate-[-4deg]" },
  { id: "1536376072261-38c75010e6c9", alt: "Loft living room with exposed brick", tag: "Loft character", className: "right-[2%] top-[22%] w-[52%] rotate-[5deg]" },
  { id: "1484154218962-a197022b5858", alt: "White kitchen with an island", tag: "Open kitchen", className: "left-[18%] bottom-[2%] w-[56%] rotate-[2deg]" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Main">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="#how">How it learns</Link>
          </Button>
          <Button asChild className="rounded-full px-4">
            <Link href="/swipe" prefetch={false}>
              Start discovering
            </Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-8 pb-20 md:px-8 lg:grid-cols-2 lg:pt-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-primary uppercase">New York City homes</p>
            <h1 className="mt-4 font-display text-6xl leading-[0.95] md:text-7xl lg:text-8xl">
              Stop filtering.
              <br />
              Start discovering.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-foreground/75">SwipeHome learns what you actually like and gets better with every home you see.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-[15px]">
                <Link href="/swipe" prefetch={false}>
                  Start discovering <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-[15px]">
                <Link href="#how">See how it learns</Link>
              </Button>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-lg" aria-hidden="true">
            {HERO.map((h) => (
              <div key={h.id} className={`absolute aspect-[4/5] overflow-hidden rounded-3xl bg-muted shadow-2xl ring-1 ring-black/5 ${h.className}`}>
                <Image src={unsplashUrl(h.id)} alt={h.alt} fill sizes="(max-width: 1024px) 60vw, 320px" className="object-cover" priority />
                <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">{h.tag}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-t bg-card/60">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <h2 className="max-w-2xl font-display text-4xl md:text-5xl">It doesn&apos;t just learn what you like. It learns how to learn you.</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                      <s.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] text-foreground/70">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-14 max-w-3xl text-sm text-muted-foreground">
              Every interaction, prediction, memory, experiment and policy version is persisted in MongoDB Atlas. Curious how the harness evolves?{" "}
              <Link href="/lab?judge=1" prefetch={false} className="font-medium text-foreground underline underline-offset-4">
                Open the lab
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-xs text-muted-foreground md:flex-row md:justify-between md:px-8">
          <p>Built for the MongoDB Harness Engineering &amp; Model Wrangling Hackathon. Listings are synthetic sample data.</p>
          <p>Recommendations use property attributes, price and the places you choose — never personal or demographic traits.</p>
        </div>
      </footer>
    </div>
  );
}
