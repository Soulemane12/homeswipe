import type { Metadata } from "next";
import { CompareView } from "@/components/compare/compare-view";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage(props: PageProps<"/compare">) {
  const { ids } = await props.searchParams;
  const list = typeof ids === "string" ? ids.split(",").filter(Boolean).slice(0, 4) : [];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-12">
      <h1 className="mb-6 font-display text-5xl md:text-6xl">Compare</h1>
      <CompareView initialIds={list} />
    </div>
  );
}
