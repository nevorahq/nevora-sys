"use client";

import { useTransition } from "react";
import { Trash2Icon, AlertTriangleIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { deleteTodoAction } from "../actions/delete-todo.action";
import { TaskStatusBadge } from "./task-status-badge";
import { getDueStatus, type DueStatus } from "../lib/due-status";
import { cn } from "@/shared/utils/cn";
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

  const isPending = isDeleting;
  const isDone = todo.status === "done";

  // Heightened-attention marker: overdue / due today / due soon (≤3 days).
  const dueStatus = getDueStatus(todo.due_date, todo.status);
  const isOverdue = dueStatus.level === "overdue";

  const priorityStyles = {
    low: "bg-accent-green-soft text-accent-green",
    medium: "bg-accent-yellow-soft text-accent-yellow",
    high: "bg-accent-pink-soft text-accent-pink",
  } as const;

  function handleDelete() {
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
        <span className={cn("soft-badge", priorityStyles[todo.priority])}>
          {dict.todos.priorities[todo.priority]}
        </span>

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
        <button
          type="button"
          onClick={handleDelete}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger"
          aria-label="Delete"
        >
          <Trash2Icon size={15} strokeWidth={1.75} />
        </button>
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

  return (
    <span
      className={cn(
        "soft-badge inline-flex items-center gap-1 whitespace-nowrap",
        overdue ? "bg-danger-soft text-danger" : "bg-accent-yellow-soft text-accent-yellow",
      )}
      aria-label={overdue ? t.ariaOverdue : t.ariaSoon}
    >
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}
