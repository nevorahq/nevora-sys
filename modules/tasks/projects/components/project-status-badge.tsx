import { cn } from "@/shared/utils/cn";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "../constants/project.constants";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active:    "bg-accent-green-soft text-accent-green",
  paused:    "bg-accent-yellow-soft text-accent-yellow",
  completed: "bg-info-soft text-info",
  archived:  "bg-surface-sunken text-text-muted",
};

export function ProjectStatusBadge({
  status,
  labels,
  className,
}: {
  status: ProjectStatus;
  /** Localized status labels; falls back to the English constant. */
  labels?: Record<ProjectStatus, string>;
  className?: string;
}) {
  return (
    <span className={cn("soft-badge", STATUS_STYLES[status], className)}>
      {(labels ?? PROJECT_STATUS_LABELS)[status]}
    </span>
  );
}
