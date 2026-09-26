"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { track } from "@/lib/client/track";

const STORAGE_KEY = "homeswipe.compare";
const MAX = 4;
const EMPTY: string[] = [];

type CompareSource = "discover" | "search" | "property" | "saved" | "map";

interface CompareContextValue {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string, source?: CompareSource) => void;
  remove: (id: string) => void;
  replace: (ids: string[], source?: "saved" | "search") => void;
  clear: () => void;
}

// Tiny external store over localStorage (per-viewer convenience; never durable state).
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedIds: string[] = EMPTY;

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedIds;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cachedIds = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : EMPTY;
  } catch {
    cachedIds = EMPTY;
  }
  return cachedIds;
}

function write(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode): keep an in-memory copy for this page view.
    cachedRaw = JSON.stringify(ids);
    cachedIds = ids;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      has: (id) => ids.includes(id),
      toggle: (id, source = "property") => {
        const current = read();
        if (current.includes(id)) {
          write(current.filter((x) => x !== id));
          return;
        }
        if (current.length >= MAX) {
          toast("You can compare up to 4 homes", { description: "Remove one from the compare tray first." });
          return;
        }
        write([...current, id]);
        track({ type: "compare_add", propertyId: id, sourceSurface: source }).catch(() => undefined);
      },
      remove: (id) => write(read().filter((x) => x !== id)),
      replace: (next, source = "saved") => {
        const current = read();
        const unique = [...new Set(next)].slice(0, MAX);
        for (const id of unique) {
          if (!current.includes(id)) track({ type: "compare_add", propertyId: id, sourceSurface: source }).catch(() => undefined);
        }
        write(unique);
      },
      clear: () => write([]),
    }),
    [ids],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used inside CompareProvider");
  return ctx;
}
