import type { Metadata } from "next";
import { connection } from "next/server";
import { Logo } from "@/components/navigation/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { SetupRequired } from "@/components/setup-required";
import { getCurrentUserId } from "@/lib/auth/session";
import { env } from "@/lib/env";
import type { ListingType } from "@/models/property";
import { availableListingTypes } from "@/services/properties/repository";
import { getOrCreateUser } from "@/services/users";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  await connection();
  if (!env().MONGODB_URI) return <SetupRequired message="Onboarding saves your search constraints to MongoDB Atlas." />;
  const [user, listingTypes] = await Promise.all([getOrCreateUser(await getCurrentUserId()), availableListingTypes()]);
  return (
    <div className="flex min-h-screen flex-col px-5 py-6 md:px-10">
      <Logo />
      <div className="flex flex-1 items-start justify-center pt-10 md:pt-16">
        <OnboardingFlow
          initial={{ constraints: user.constraints, positive: user.explicitPreferences.positive, negative: user.explicitPreferences.negative }}
          listingTypes={listingTypes.filter((t): t is ListingType => t === "sale" || t === "rent")}
        />
      </div>
    </div>
  );
}
