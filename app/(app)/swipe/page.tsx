import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SwipeDeck } from "@/components/swipe/swipe-deck";
import { getCurrentUserId } from "@/lib/auth/session";
import { isJudgeMode } from "@/lib/judge";
import { getOrCreateUser } from "@/services/users";

export const metadata: Metadata = { title: "Swipe" };

export default async function SwipePage() {
  const user = await getOrCreateUser(await getCurrentUserId());
  if (!user.onboardingCompletedAt) redirect("/onboarding");
  return (
    <div className="px-4 pt-6 md:pt-10">
      <SwipeDeck judge={await isJudgeMode()} />
    </div>
  );
}
