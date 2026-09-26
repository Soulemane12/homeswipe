"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompare } from "./compare-provider";

export function CompareTray() {
  const { ids, clear } = useCompare();
  const pathname = usePathname();
  if (ids.length === 0 || pathname.startsWith("/compare") || pathname.startsWith("/swipe")) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
      <div className="flex items-center gap-3 rounded-full border bg-card/95 py-1.5 pr-1.5 pl-4 shadow-lg backdrop-blur">
        <span className="text-sm">
          <span className="font-medium tabular">{ids.length}</span> {ids.length === 1 ? "home" : "homes"} to compare
        </span>
        {ids.length >= 2 ? (
          <Button asChild size="sm" className="rounded-full">
            <Link href={`/compare?ids=${ids.join(",")}`}>Compare</Link>
          </Button>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">Add one more</span>
        )}
        <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={clear} aria-label="Clear compare list">
          <X />
        </Button>
      </div>
    </div>
  );
}
