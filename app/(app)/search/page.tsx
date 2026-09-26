import type { Metadata } from "next";
import { filtersFromConstraints, filtersFromParams, hasFilterParams } from "@/components/search/filter-state";
import { SearchExperience } from "@/components/search/search-experience";
import { getCurrentUserId } from "@/lib/auth/session";
import { isJudgeMode } from "@/lib/judge";
import { getOrCreateUser } from "@/services/users";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const raw = await props.searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const user = await getOrCreateUser(await getCurrentUserId());
  const initialFilters = hasFilterParams(params) ? filtersFromParams(params) : filtersFromConstraints(user.constraints);
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-12">
      <h1 className="font-display text-5xl md:text-6xl">Search</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Filter like usual, or just describe the home — results stay personalized within your criteria.</p>
      <SearchExperience initialQuery={params.q ?? ""} initialFilters={initialFilters} similarTo={params.similar} judge={await isJudgeMode()} />
    </div>
  );
}
