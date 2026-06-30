import Link from "next/link";
import { CheckSquareIcon, CalendarIcon } from "lucide-react";
import { projectDetailUrl } from "@/shared/config/routes";
import { formatDate } from "@/shared/utils/format-date";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectProgressBar } from "./project-progress-bar";
import type { ProjectWithStats } from "../types/project.types";

export function ProjectCard({ project }: { project: ProjectWithStats }) {
  return (
    <Link
      href={projectDetailUrl(project.id)}
      className="soft-card flex flex-col gap-3 p-5 transition-shadow hover:shadow-neu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color ?? "var(--color-text-muted)" }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{project.name}</p>
            {project.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{project.description}</p>
            )}
          </div>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <ProjectProgressBar progress={project.progress} />

      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <CheckSquareIcon size={13} strokeWidth={1.75} />
          {project.doneCount}/{project.taskCount} tasks
        </span>
        {project.due_date && (
          <span className="inline-flex items-center gap-1">
            <CalendarIcon size={13} strokeWidth={1.75} />
            {formatDate(project.due_date)}
          </span>
        )}
      </div>
    </Link>
  );
}
