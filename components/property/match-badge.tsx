import { cn } from "@/lib/utils";

export function MatchBadge({ percent, className, size = "md" }: { percent: number; className?: string; size?: "sm" | "md" }) {
  const tone = percent >= 85 ? "bg-primary text-primary-foreground" : percent >= 70 ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full font-medium tabular", size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs", tone, className)}>
      {percent}% match
    </span>
  );
}
