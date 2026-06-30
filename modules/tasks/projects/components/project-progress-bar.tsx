import { cn } from "@/shared/utils/cn";

/**
 * Server-computed project progress. The value comes from projects.progress
 * (maintained by recalculate_project_progress) — the bar only renders it.
 */
export function ProjectProgressBar({
  progress,
  showLabel = true,
  className,
}: {
  progress: number;
  showLabel?: boolean;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  const done = value >= 100;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-(--neu-radius-pill) bg-surface-sunken shadow-neu-inset"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-(--neu-radius-pill) transition-[width] duration-300",
            done ? "bg-accent-green" : "bg-text-primary",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-text-secondary">
          {value}%
        </span>
      )}
    </div>
  );
}
