"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client/api";
import { OPEN_COMMAND_EVENT } from "./command-events";

interface CommandResponse {
  kind: string;
  message: string;
  href?: string;
}

const GENERAL_SUGGESTIONS = ["Show modern 2-bedroom condos below $800k", "Bright loft with exposed brick in Brooklyn", "I don't care about parking", "I love balconies"];
const PROPERTY_SUGGESTIONS = ["Find something like this but cheaper", "Keep this style but closer to Manhattan", "I like this kitchen but not the neighborhood", "Why do you think I would like this?"];

/**
 * Natural-language control layer. Commands are parsed server-side into structured actions
 * (search, refine, explain, correct preferences) — this is not a chat window.
 */
export function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CommandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const propertyId = /^\/property\/([^/]+)/.exec(pathname)?.[1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      const prefill = (e as CustomEvent<{ prefill?: string }>).detail?.prefill;
      setText(prefill ?? "");
      setResult(null);
      setError(null);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<CommandResponse>("/api/command", { body: { text: trimmed, pathname, propertyId } });
      setResult(res);
      if (res.href) {
        router.push(res.href);
        setTimeout(() => setOpen(false), 900);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  const suggestions = propertyId ? PROPERTY_SUGGESTIONS : GENERAL_SUGGESTIONS;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Ask SwipeHome</DialogTitle>
        <DialogDescription className="sr-only">Search, refine recommendations, or correct what SwipeHome has learned, in plain language.</DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
          className="flex items-center gap-3 border-b px-4"
        >
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={propertyId ? "Ask about this home, or refine…" : "Describe a home, or tell SwipeHome what you like…"}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            aria-label="Command"
            maxLength={300}
          />
          <button type="submit" disabled={pending || text.trim().length < 2} className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Run command">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          </button>
        </form>
        <div className="p-2">
          {result ? (
            <p className="rounded-lg bg-accent/60 px-3 py-3 text-sm text-accent-foreground" role="status">
              {result.message}
            </p>
          ) : error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <ul aria-label="Suggestions">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => void submit(s)} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
