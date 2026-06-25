"use client";

import { useState, useTransition } from "react";
import { CalendarIcon, TagIcon } from "lucide-react";
import { changeTaskStatusAction } from "@/modules/tasks/actions/change-task-status.action";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/modules/tasks/constants/task.constants";
import { Modal } from "@/shared/ui/modal";
import { TodoEditForm } from "./todo-edit-form";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
import type { Todo } from "@/entities/todo/model";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { TaskStatus } from "@/modules/tasks/constants/task.constants";

interface TaskDetailModalProps {
  todo: Todo & { status: TaskStatus };
  dict: Dictionary;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo:        "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  in_progress: "bg-accent-blue-soft text-accent-blue",
  in_review:   "bg-accent-yellow-soft text-accent-yellow",
  done:        "bg-accent-green-soft text-accent-green",
  cancelled:   "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    "bg-accent-green-soft text-accent-green",
  medium: "bg-accent-yellow-soft text-accent-yellow",
  high:   "bg-accent-pink-soft text-accent-pink",
};

export function TaskDetailModal({ todo, dict, isOpen, onClose }: TaskDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as TaskStatus;
    setStatusError(null);
    startTransition(async () => {
      const result = await changeTaskStatusAction(todo.id, newStatus);
      if (result.error) setStatusError(result.error);
    });
  }

  const statusOptions = TASK_STATUSES.map((s) => ({
    value: s,
    label: TASK_STATUS_LABELS[s],
  }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? dict.todos.form.updateButton : "Task Detail"}>
      {editing ? (
        <TodoEditForm
          todo={todo}
          dict={dict}
          onSuccess={() => {
            setEditing(false);
            onClose();
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Title */}
          <div>
            <p className="text-base font-semibold text-text-primary">{todo.title}</p>
            {todo.description && (
              <p className="mt-1.5 text-sm text-text-secondary">{todo.description}</p>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_STYLES[todo.priority])}>
              <TagIcon size={10} className="mr-1 inline-block" />
              {dict.todos.priorities[todo.priority]}
            </span>

            {todo.due_date && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <CalendarIcon size={12} />
                {formatDate(todo.due_date)}
              </span>
            )}
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-status" className="text-sm font-medium text-text-secondary">
              Status
            </label>
            <div className="flex items-center gap-3">
              <select
                id="task-status"
                defaultValue={todo.status}
                onChange={handleStatusChange}
                disabled={isPending}
                className={cn(
                  "soft-control px-4 py-2.5 text-sm appearance-none",
                  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236F6E70%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
                  "bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-10",
                  isPending && "opacity-50",
                )}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[todo.status as TaskStatus])}>
                {TASK_STATUS_LABELS[todo.status as TaskStatus] ?? todo.status}
              </span>
            </div>
            {statusError && (
              <p className="text-xs text-danger" role="alert">{statusError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-text-muted hover:text-text-primary underline underline-offset-2"
            >
              Edit task
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
