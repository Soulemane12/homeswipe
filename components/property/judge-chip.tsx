import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/models/card";

/** Judge-mode overlay: the prediction persisted before the user acted. */
export function JudgeChip({ judge, className }: { judge: NonNullable<PropertyCardData["judge"]>; className?: string }) {
  const like = judge.predictedLabel === "LIKE";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md bg-foreground/85 px-2 py-1 font-mono text-[10px] text-background backdrop-blur", className)}
      title="Prediction persisted before interaction (judge mode)"
    >
      <span className={cn("size-1.5 rounded-full", like ? "bg-like" : "bg-nope")} aria-hidden="true" />
      pred {judge.predictedLabel} · score {judge.predictedLikeScore.toFixed(2)}
      {typeof judge.calibratedLikeProbability === "number" && ` · p≈${judge.calibratedLikeProbability.toFixed(2)}`} · v{judge.policyVersion}
      {judge.exploration && ` · explore${judge.exploration.targetDimension ? `:${judge.exploration.targetDimension}` : ""}`}
    </span>
  );
}
