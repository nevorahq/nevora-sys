"use client";

import { useTransition } from "react";
import { Trash2Icon, AlertTriangleIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { deleteTodoAction } from "../actions/delete-todo.action";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { TaskStatusBadge } from "./task-status-badge";
import { getDueStatus, type DueStatus } from "../lib/due-status";
import { cn } from "@/shared/utils/cn";
import { PriorityBadge } from "@/shared/ui/priority-badge";
import { formatDate } from "@/shared/utils/format-date";
import type { Todo } from "@/entities/todo/model";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";

interface TodoItemProps {
  todo: Todo;
  dict: Dictionary;
}

export function TodoItem({ todo, dict }: TodoItemProps) {
  const [isDeleting, startDelete] = useTransition();
  const { blocked, message } = useAccessGate("write");

  const isPending = isDeleting;
  const isDone = todo.status === "done";

  // Heightened-attention marker: overdue / due today / due soon (≤3 days).
  const dueStatus = getDueStatus(todo.due_date, todo.status);
  const isOverdue = dueStatus.level === "overdue";

  function handleDelete() {
    if (blocked) return;
    startDelete(async () => {
      await deleteTodoAction(todo.id);
    });
  }

  return (
      <div
        className={cn(
          "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
          isPending && "opacity-50 pointer-events-none",
          // Overdue tasks get an extra accent ring so they stand out at a glance.
          isOverdue && "ring-1 ring-danger/30",
        )}
      >
        {/* Status badge — постоянно виден и позволяет менять статус на карточке */}
        <TaskStatusBadge taskId={todo.id} status={todo.status} dict={dict} />

        {/* Content */}
        <Link href={`${ROUTES.tasks}/${todo.id}`} className="min-w-0 flex-1 rounded-(--neu-radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <p
            className={cn(
              "text-sm font-medium truncate",
              isDone
                ? "text-text-muted line-through"
                : "text-text-primary",
            )}
          >
            {todo.title}
          </p>
          {todo.description && (
            <p className="mt-0.5 text-xs text-text-muted truncate">
              {todo.description}
            </p>
          )}
        </Link>

        {/* Project badge — only when the task belongs to a project */}
        {todo.project && (
          <Link
            href={projectDetailUrl(todo.project.id)}
            className="hidden items-center gap-1.5 rounded-(--neu-radius-pill) bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary sm:inline-flex"
            title={todo.project.name}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: todo.project.color ?? "var(--color-text-muted)" }}
              aria-hidden
            />
            <span className="max-w-[8rem] truncate">{todo.project.name}</span>
          </Link>
        )}

        {/* Priority badge */}
        <PriorityBadge priority={todo.priority} label={dict.todos.priorities[todo.priority]} />

        {/* Due-date attention marker (overdue / today / soon), else plain date */}
        {dueStatus.level !== "none" ? (
          <DueBadge dueStatus={dueStatus} dict={dict} />
        ) : (
          todo.due_date && (
            <span className="hidden sm:inline text-xs text-text-muted">
              {formatDate(todo.due_date)}
            </span>
          )
        )}

        {/* Delete button */}
        <RestrictedActionTooltip message={blocked ? message : dict.todos.item.delete}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={blocked}
            className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={blocked ? `${dict.todos.item.delete}. ${message}` : dict.todos.item.delete}
          >
            <Trash2Icon size={15} strokeWidth={1.75} />
          </button>
        </RestrictedActionTooltip>
      </div>
  );
}

/** Compact urgency marker shown on the card when a due date needs attention. */
function DueBadge({ dueStatus, dict }: { dueStatus: DueStatus; dict: Dictionary }) {
  const t = dict.todos.due;
  const overdue = dueStatus.level === "overdue";

  let label: string;
  if (dueStatus.level === "overdue") label = t.overdue;
  else if (dueStatus.level === "due_today") label = t.today;
  else if (dueStatus.days === 1) label = t.tomorrow;
  else label = t.inDays.replace("{days}", String(dueStatus.days));

  const Icon = overdue ? AlertTriangleIcon : ClockIcon;

  // Mobile: an icon in a tinted circle. Desktop: the icon with the label in
  // strong text, on a tint dark enough to read (yellow-on-yellow was not).
  return (
    <span
      className={cn(
        "soft-badge shrink-0 justify-center gap-1 whitespace-nowrap font-semibold",
        "h-6 w-6 p-0 md:h-auto md:w-auto md:px-2.5 md:py-0.5",
        overdue ? "bg-danger-soft text-danger" : "bg-accent-yellow-soft text-text-primary",
      )}
      aria-label={overdue ? t.ariaOverdue : t.ariaSoon}
      title={label}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      <span className="sr-only md:not-sr-only">{label}</span>
    </span>
  );
}
