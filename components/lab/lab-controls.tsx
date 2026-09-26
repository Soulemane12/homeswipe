"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  remainingEligible: number;
}

export function LabControls({ scope, demoTools, profiles }: { scope: "real" | "simulated" | "combined"; demoTools: boolean; profiles: { key: string; label: string; description: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"evolve" | "simulate" | "reset" | null>(null);
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
      const lowInventory = r.remainingEligible < 25 ? ` · only ${r.remainingEligible} unseen homes left in your criteria — more simulation will skew toward dislikes; reset for a clean run` : "";
      const msg = `${r.recorded} simulated interactions (${r.likes} likes, ${r.dislikes} dislikes) · live predictions ${r.correct}/${r.resolved} correct${r.exhausted ? " · inventory exhausted" : ""}${lowInventory}`;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void evolve()} disabled={busy !== null} className="rounded-full">
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
          <Button variant="outline" onClick={() => void simulate()} disabled={busy !== null} className="rounded-full">
            {busy === "simulate" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Simulate {count} interactions
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={busy !== null} className="ml-auto rounded-full text-muted-foreground">
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
