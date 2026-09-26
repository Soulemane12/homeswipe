import type { Metadata } from "next";
import Link from "next/link";
import { CriteriaForm } from "@/components/profile/criteria-form";
import { SavedSearches } from "@/components/profile/saved-searches";
import { Button } from "@/components/ui/button";
import { getCurrentUserId } from "@/lib/auth/session";
import { isJudgeMode } from "@/lib/judge";
import { getOrCreateUser } from "@/services/users";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getOrCreateUser(await getCurrentUserId());
  const judge = await isJudgeMode();
  return (
    <div className="mx-auto max-w-3xl space-y-14 px-4 pt-8 md:px-6 md:pt-12">
      <div>
        <h1 className="font-display text-5xl md:text-6xl">Profile</h1>
        <p className="mt-2 text-muted-foreground">Demo account · your data is stored in MongoDB Atlas.</p>
      </div>

      <section aria-labelledby="criteria">
        <h2 id="criteria" className="font-display text-3xl">Search criteria</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">Hard limits. Recommendations never go outside them, and HomeSwipe&apos;s learning can&apos;t change them.</p>
        <CriteriaForm constraints={user.constraints} explicit={user.explicitPreferences} />
      </section>

      <section aria-labelledby="alerts">
        <h2 id="alerts" className="font-display text-3xl">Saved searches &amp; alerts</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">HomeSwipe tracks new listings and strong matches for each saved search.</p>
        <SavedSearches />
      </section>

      <section aria-labelledby="judge" className="rounded-3xl border p-6">
        <h2 id="judge" className="text-lg font-semibold">Judge mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shows the predictions HomeSwipe made before each home appeared, the active harness policy, and the lab.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant={judge ? "outline" : "default"} className="rounded-full">
            <Link href={judge ? "/profile?judge=0" : "/profile?judge=1"} prefetch={false}>
              {judge ? "Turn off judge mode" : "Turn on judge mode"}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/lab" prefetch={false}>
              Open the harness lab
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="fair" className="text-sm text-muted-foreground">
        <h2 id="fair" className="mb-2 font-semibold text-foreground">How HomeSwipe personalizes</h2>
        <p>
          Recommendations use only the criteria you set, the places you choose, and the physical attributes of homes (light, layout, finishes, amenities). HomeSwipe never infers or uses race, color, religion, sex, disability, familial status or national
          origin — or neighborhood demographics as a stand-in for them.
        </p>
      </section>
    </div>
  );
}
