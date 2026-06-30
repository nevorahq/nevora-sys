"use client";

import { useState } from "react";
import { CalendarIcon, PencilIcon } from "lucide-react";
import { UpdateTaskDueDateDialog } from "./update-task-due-date-dialog";
import { formatDate } from "@/shared/utils/format-date";
import type { TaskStatus } from "../constants/task.constants";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TaskDueDateFieldProps {
  taskId: string;
  /** Current due date in "YYYY-MM-DD" form, or null when unset. */
  dueDate: string | null;
  /** Current task status — the due date is editable only while in_progress. */
  status: TaskStatus;
  /** Whether the current user may change the due date. */
  canEdit: boolean;
  dict: Dictionary;
}

/**
 * TaskDueDateField — секция "Срок" в детальной карточке задачи.
 *
 * Срок исполнения можно задавать/менять только когда задача в работе
 * (status === "in_progress"). Для todo показываем подсказку, для done —
 * только дату (read-only). Read-only пользователи всегда видят только дату.
 */
export function TaskDueDateField({ taskId, dueDate, status, canEdit, dict }: TaskDueDateFieldProps) {
  const t = dict.todos.dueDate;
  const [open, setOpen] = useState(false);

  const editable = canEdit && status === "in_progress";

  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        <CalendarIcon size={13} /> {t.label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-text-primary">
          {dueDate ? formatDate(`${dueDate}T00:00:00`) : t.notSet}
        </p>
        {editable && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            <PencilIcon size={12} />
            {dueDate ? t.change : t.set}
          </button>
        )}
      </div>

      {/* Подсказка: до перевода в работу срок установить нельзя. */}
      {canEdit && status === "todo" && (
        <p className="mt-1.5 text-xs text-text-muted">{t.lockedHint}</p>
      )}

      {editable && (
        <UpdateTaskDueDateDialog
          taskId={taskId}
          currentDueDate={dueDate}
          isOpen={open}
          onClose={() => setOpen(false)}
          dict={dict}
        />
      )}
    </div>
  );
}
