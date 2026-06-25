import type { ActionItemPriority } from "../types/action-item.types";

const STYLES: Record<ActionItemPriority, string> = {
  critical: "bg-accent-pink-soft text-accent-pink",
  high: "bg-accent-yellow-soft text-accent-yellow",
  medium: "bg-accent-blue-soft text-accent-blue",
  low: "bg-accent-green-soft text-accent-green",
  info: "bg-surface-sunken text-text-muted",
};

const LABELS: Record<ActionItemPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export function ActionPriorityBadge({ priority }: { priority: ActionItemPriority }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[priority]}`}>
      {LABELS[priority]}
    </span>
  );
}
