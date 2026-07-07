"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, PencilIcon, ArchiveIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { ROUTES } from "@/shared/config/routes";
import { formatDate } from "@/shared/utils/format-date";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectProgressBar } from "./project-progress-bar";
import { ProjectForm } from "./project-form";
import { archiveProjectAction } from "../actions/archive-project.action";
import type { ProjectWithStats } from "../types/project.types";

interface ProjectHeaderProps {
  project: ProjectWithStats;
  ownerName: string | null;
  /** May edit the project (data.write). */
  canManage: boolean;
  /** May archive the project (data.delete — manager+). */
  canArchive: boolean;
}

export function ProjectHeader({ project, ownerName, canManage, canArchive }: ProjectHeaderProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isArchiving, startArchive] = useTransition();
  const isArchived = Boolean(project.archived_at);
  const { blocked, message } = useAccessGate("write");
  const allowManage = canManage && !blocked;
  const allowArchive = canArchive && !blocked;

  function handleArchive() {
    startArchive(async () => {
      const result = await archiveProjectAction(project.id);
      if (!result.error) {
        setConfirmArchive(false);
        router.push(ROUTES.projects);
        router.refresh();
      }
    });
  }

  return (
    <div className="soft-card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Link
          href={ROUTES.projects}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeftIcon size={14} /> Projects
        </Link>

        {!isArchived && (canManage || canArchive) && (
          <div className="flex items-center gap-2">
            {canManage && (
              <RestrictedActionTooltip message={blocked ? message : "Edit"}>
                <Button variant="secondary" disabled={!allowManage} className="h-9 gap-1.5 px-3 text-xs" onClick={() => setEditing(true)}>
                  <PencilIcon size={14} /> Edit
                </Button>
              </RestrictedActionTooltip>
            )}
            {canArchive && (
              <RestrictedActionTooltip message={blocked ? message : "Archive"}>
                <Button variant="ghost" disabled={!allowArchive} className="h-9 gap-1.5 px-3 text-xs" onClick={() => setConfirmArchive(true)}>
                  <ArchiveIcon size={14} /> Archive
                </Button>
              </RestrictedActionTooltip>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: project.color ?? "var(--color-text-muted)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-text-primary">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-text-secondary">{project.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted">
        <span>
          Owner: <span className="font-medium text-text-secondary">{ownerName ?? "Unassigned"}</span>
        </span>
        {project.due_date && (
          <span className="inline-flex items-center gap-1">
            <CalendarIcon size={13} /> Due {formatDate(project.due_date)}
          </span>
        )}
        <span>
          {project.doneCount}/{project.taskCount} tasks done
        </span>
      </div>

      <ProjectProgressBar progress={project.progress} />

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit project">
        <ProjectForm project={project} onSuccess={() => setEditing(false)} />
      </Modal>

      <Modal isOpen={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive project?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Archiving hides <span className="font-medium text-text-primary">{project.name}</span> from
            active lists. Its tasks are kept and simply detached from the project view. You can still find
            it in archived projects.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="h-9 px-4 text-sm" isLoading={isArchiving} onClick={handleArchive}>
              Archive
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
