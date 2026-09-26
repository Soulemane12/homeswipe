import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { DiscoverFeed } from "@/components/recommendation/discover-feed";
import { Button } from "@/components/ui/button";
import { getCurrentUserId } from "@/lib/auth/session";
import { isJudgeMode } from "@/lib/judge";
import { getOrCreateUser, touchUser } from "@/services/users";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const userId = await getCurrentUserId();
  const user = await getOrCreateUser(userId);
  if (!user.onboardingCompletedAt) redirect("/onboarding");
  const judge = await isJudgeMode();
  const { returning: welcomeBack } = await touchUser(userId);
  const summary = user.preferenceProfile?.summary;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-12">
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">{welcomeBack ? "Welcome back — your taste profile picked up where you left off" : "Your recommendations"}</p>
          <h1 className="mt-1 font-display text-5xl leading-[1.05] md:text-6xl">For you</h1>
          {summary && <p className="mt-3 text-[15px] text-foreground/75">{summary}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="lg" className="rounded-full px-4">
            <Link href="/home-dna">Your Home DNA</Link>
          </Button>
          <Button asChild size="lg" className="rounded-full px-5">
            <Link href="/swipe" prefetch={false}>
              <Layers /> Swipe mode
            </Link>
          </Button>
        </div>
      </div>
      <DiscoverFeed judge={judge} />
    </div>
  );
}
