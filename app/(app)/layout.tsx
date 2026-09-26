import { connection } from "next/server";
import { CommandBar } from "@/components/command/command-bar";
import { CompareProvider } from "@/components/compare/compare-provider";
import { CompareTray } from "@/components/compare/compare-tray";
import { AppHeader } from "@/components/navigation/app-header";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { SetupRequired } from "@/components/setup-required";
import { getCurrentUserId } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { isJudgeMode } from "@/lib/judge";
import { getActivePolicy } from "@/services/harness/policies";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Everything below reads per-user data from MongoDB at request time — never prerender it.
  await connection();
  if (!env().MONGODB_URI) {
    return <SetupRequired message="HomeSwipe stores every interaction, prediction, memory and policy version in MongoDB Atlas, so it needs a database connection." />;
  }
  const judge = await isJudgeMode();
  const policy = judge ? await getActivePolicy(await getCurrentUserId()) : null;
  return (
    <CompareProvider>
      <AppHeader judge={policy ? { policyVersion: policy.version } : null} />
      <main className="flex-1 pb-40 md:pb-24">{children}</main>
      <MobileNav />
      <CompareTray />
      <CommandBar />
    </CompareProvider>
  );
}
