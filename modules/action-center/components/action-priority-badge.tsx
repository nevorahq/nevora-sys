import type { ActionItemPriority } from "../types/action-item.types";
import { cn } from "@/shared/utils/cn";

const DOT: Record<ActionItemPriority, string> = {
  critical: "bg-danger ring-danger/25",
  high: "bg-accent-yellow ring-accent-yellow/30",
  medium: "bg-info ring-info/25",
  low: "bg-accent-green ring-accent-green/25",
  info: "bg-text-muted ring-text-muted/20",
};

/**
 * Priority as a coloured dot. On mobile the dot stands alone (the label stays
 * for screen readers); from md up it sits in a pill with the label in strong
 * text, so the colour carries the meaning and the text stays readable.
 */
export function ActionPriorityBadge({ priority, label }: { priority: ActionItemPriority; label: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1.5 md:rounded-full md:border md:border-border-soft md:bg-surface md:px-2.5 md:py-1 md:shadow-neu-sm"
    >
      <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-4 md:h-2 md:w-2 md:ring-2", DOT[priority])} />
      <span className="sr-only text-xs font-semibold text-text-primary md:not-sr-only">{label}</span>
    </span>
  );
}
