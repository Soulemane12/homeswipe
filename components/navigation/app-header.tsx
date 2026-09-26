"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Search as SearchIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCommandBar } from "@/components/command/command-events";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { DESKTOP_NAV, isActive } from "./nav-items";

export function AppHeader({ judge }: { judge: { policyVersion: number } | null }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
        <Logo href="/discover" />
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {DESKTOP_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                isActive(pathname, item.href) ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
              )}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCommandBar()}
            className="hidden h-9 w-64 items-center gap-2 rounded-full border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 lg:flex"
          >
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span>Ask HomeSwipe…</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => openCommandBar()} aria-label="Ask HomeSwipe">
            <SearchIcon />
          </Button>
          {judge && (
            <Link href="/lab" className="hidden items-center gap-1.5 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary sm:flex" title="Judge mode: active harness policy">
              <Layers className="size-3.5" aria-hidden="true" />
              Harness v{judge.policyVersion}
            </Link>
          )}
          <Button asChild size="lg" className="hidden rounded-full px-4 md:inline-flex">
            <Link href="/swipe" prefetch={false}>
              Swipe
            </Link>
          </Button>
          <Link href="/profile" prefetch={false} className="hidden size-9 place-items-center rounded-full bg-secondary text-sm font-medium md:grid" aria-label="Profile">
            D
          </Link>
        </div>
      </div>
    </header>
  );
}
