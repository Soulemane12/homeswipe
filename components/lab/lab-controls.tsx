"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, KeyRound, Loader2, Lock, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";

interface EvolutionSummary {
  status: string;
  explanation: string;
  newVersion?: number;
  activeVersion: number;
}
interface SimulationSummary {
  recorded: number;
  likes: number;
  dislikes: number;
  resolved: number;
  correct: number;
  exhausted: boolean;
}

export function LabControls({
  scope,
  demoTools,
  profiles,
  admin,
}: {
  scope: "real" | "simulated" | "combined";
  demoTools: boolean;
  profiles: { key: string; label: string; description: string }[];
  /** Server-computed booleans only: whether an admin secret is configured and whether this browser is unlocked. */
  admin: { configured: boolean; unlocked: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"evolve" | "simulate" | "reset" | "unlock" | null>(null);
  const [secret, setSecret] = useState("");
  const locked = !admin.configured || !admin.unlocked;
  const [profile, setProfile] = useState(profiles[0]?.key ?? "light_modernist");
  const [count, setCount] = useState(30);
  const [confirmReset, setConfirmReset] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  async function evolve() {
    setBusy("evolve");
    setLast(null);
    try {
      const r = await apiFetch<EvolutionSummary>("/api/harness/evaluate", { body: { scope } });
      const title = r.status === "promoted" ? `Promoted harness v${r.newVersion}` : r.status === "rejected" ? `Candidate v${r.newVersion ?? "?"} rejected` : r.status === "locked" ? "Evolution already running" : "Not enough evidence yet";
      setLast(`${title}. ${r.explanation}`);
      toast(title, { description: r.explanation });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function simulate() {
    setBusy("simulate");
    setLast(null);
    try {
      const r = await apiFetch<SimulationSummary>("/api/lab/simulate", { body: { profile, count } });
      const msg = `${r.recorded} simulated interactions (${r.likes} likes, ${r.dislikes} dislikes) · live predictions ${r.correct}/${r.resolved} correct${r.exhausted ? " · inventory exhausted" : ""}`;
      setLast(msg);
      toast("Simulation complete", { description: msg });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setLast(null);
    try {
      await apiFetch("/api/lab/reset", { body: { confirm: "RESET", keepOnboarding: true } });
      setConfirmReset(false);
      setLast("Demo reset: interactions, predictions, memory, evaluations and policies cleared; v1 restored.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unlock() {
    setBusy("unlock");
    try {
      await apiFetch("/api/lab/unlock", { body: { secret } });
      setSecret("");
      toast("Operator actions unlocked");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function lock() {
    await apiFetch("/api/lab/unlock", { method: "DELETE" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!admin.configured ? (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" /> Operator actions are disabled on this deployment. The lab stays read-only.
        </p>
      ) : !admin.unlocked ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (secret) void unlock();
          }}
        >
          <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Operator actions are locked.</span>
          <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Admin secret" aria-label="Admin secret" className="h-8 w-40" />
          <Button type="submit" size="sm" variant="outline" disabled={!secret || busy !== null}>
            {busy === "unlock" && <Loader2 className="animate-spin" />} Unlock
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden="true" /> Operator unlocked
          </span>
          <Button variant="ghost" size="sm" onClick={() => void lock()}>
            <Lock /> Lock
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void evolve()} disabled={busy !== null || locked} className="rounded-full">
          {busy === "evolve" ? <Loader2 className="animate-spin" /> : <Play />} Run evolution on {scope} data
        </Button>
        {!demoTools && <span className="text-xs text-muted-foreground">Simulation and reset are available in demo mode or development only.</span>}
      </div>
      {demoTools && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Hidden profile
            <select className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground" value={profile} onChange={(e) => setProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.key} value={p.key} title={p.description}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Interactions
            <select className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[10, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={() => void simulate()} disabled={busy !== null || locked} className="rounded-full">
            {busy === "simulate" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Simulate {count} interactions
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={busy !== null || locked} className="ml-auto rounded-full text-muted-foreground">
            <RotateCcw /> Reset demo
          </Button>
          <p className="basis-full text-xs text-muted-foreground">Simulated interactions run through the real feed, prediction and learning pipeline and are tagged <code>simulated: true</code> — excluded from “Real” metrics.</p>
        </div>
      )}
      {last && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm" role="status">
          {last}
        </p>
      )}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the demo user?</DialogTitle>
            <DialogDescription>Deletes this user&apos;s interactions, impressions, predictions, learned memory, evaluations and policy chain, then restores v1. Listings and onboarding criteria are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void reset()} disabled={busy === "reset"}>
              {busy === "reset" && <Loader2 className="animate-spin" />} Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
