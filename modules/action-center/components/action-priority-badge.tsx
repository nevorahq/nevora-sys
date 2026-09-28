import type { ActionItemPriority } from "../types/action-item.types";

const STYLES: Record<ActionItemPriority, string> = {
  critical: "bg-accent-pink-soft text-accent-pink",
  high: "bg-accent-yellow-soft text-accent-yellow",
  medium: "bg-accent-blue-soft text-accent-blue",
  low: "bg-accent-green-soft text-accent-green",
  info: "bg-surface-sunken text-text-muted",
};

export function ActionPriorityBadge({ priority, label }: { priority: ActionItemPriority; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[priority]}`}>
      {label}
    </span>
  );
}
