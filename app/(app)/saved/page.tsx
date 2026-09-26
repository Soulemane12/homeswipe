import type { Metadata } from "next";
import { SavedView } from "@/components/saved/saved-view";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-12">
      <h1 className="mb-6 font-display text-5xl md:text-6xl">Saved</h1>
      <SavedView />
    </div>
  );
}
