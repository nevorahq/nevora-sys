"use client";

import { useState, useTransition } from "react";
import { changeTaskStatusAction } from "@/modules/tasks/actions/change-task-status.action";
import { TASK_STATUSES, type TaskStatus } from "@/modules/tasks/constants/task.constants";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * TaskStatusBadge — заметный цветной бейдж статуса задачи, который сам
 * является переключателем. Любой из трёх статусов выбирается прямо на
 * карточке, без отдельной формы редактирования.
 *
 * Реализован на нативном <select>: бесплатно даёт доступность (роль, фокус),
 * полную поддержку клавиатуры и aria. Во время сохранения переключатель
 * блокируется; при ошибке значение возвращается к предыдущему и показывается
 * доступное сообщение (role="alert").
 */
const STATUS_STYLES: Record<TaskStatus, string> = {
  todo:        "bg-surface-sunken text-text-secondary",
  in_progress: "bg-accent-lilac-soft text-accent-lilac",
  done:        "bg-accent-green-soft text-accent-green",
};

interface TaskStatusBadgeProps {
  taskId: string;
  status: TaskStatus;
  dict: Dictionary;
  className?: string;
}

export function TaskStatusBadge({ taskId, status, dict, className }: TaskStatusBadgeProps) {
  const [current, setCurrent] = useState<TaskStatus>(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const labels = dict.todos.statuses;
  const t = dict.todos.statusBadge;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as TaskStatus;
    const previous = current;
    if (next === previous) return;

    setError(null);
    setCurrent(next); // оптимистично

    startTransition(async () => {
      const result = await changeTaskStatusAction(taskId, next);
      if (result?.error) {
        setCurrent(previous);            // откат к прежнему статусу
        setError(result.error || t.changeFailed);
      }
    });
  }

  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      <span
        className={cn(
          "relative inline-flex items-center rounded-(--neu-radius-pill) text-xs font-medium transition-opacity",
          STATUS_STYLES[current],
          isPending && "opacity-60",
        )}
      >
        <select
          aria-label={t.ariaLabel}
          aria-busy={isPending}
          value={current}
          onChange={handleChange}
          disabled={isPending}
          className={cn(
            "cursor-pointer appearance-none rounded-(--neu-radius-pill) bg-transparent",
            "py-1 pl-3 pr-7 text-xs font-medium text-inherit",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            isPending ? "cursor-wait" : "cursor-pointer",
          )}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
        {/* chevron */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-2 h-3 w-3 opacity-70"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </span>

      {/* Состояние загрузки для скринридеров */}
      {isPending && (
        <span role="status" className="sr-only">
          {t.changing}
        </span>
      )}

      {/* Доступное сообщение об ошибке */}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
