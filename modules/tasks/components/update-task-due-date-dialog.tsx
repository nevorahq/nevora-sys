"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { updateTaskDueDateAction } from "../actions/update-task-due-date.action";
import { TASK_DUE_DATE_REASON_MAX_LENGTH } from "../constants/task.constants";
import { formatDate } from "@/shared/utils/format-date";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface UpdateTaskDueDateDialogProps {
  taskId: string;
  /** Current due date in "YYYY-MM-DD" form, or null when unset. */
  currentDueDate: string | null;
  isOpen: boolean;
  onClose: () => void;
  dict: Dictionary;
}

/**
 * UpdateTaskDueDateDialog — превращает изменение срока в осознанное действие:
 * показывает текущий срок, даёт выбрать новый и (опционально) указать причину.
 *
 * Submit заблокирован, пока дата не выбрана или совпадает с текущей. Серверный
 * action остаётся источником истины валидации/прав — здесь только UX-гард.
 */
export function UpdateTaskDueDateDialog({
  taskId,
  currentDueDate,
  isOpen,
  onClose,
  dict,
}: UpdateTaskDueDateDialogProps) {
  const t = dict.todos.dueDate;
  const [newDate, setNewDate] = useState<string>(currentDueDate ?? "");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unchanged = newDate === (currentDueDate ?? "");
  const canSubmit = newDate !== "" && !unchanged && !isPending;

  function handleSave() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTaskDueDateAction({
        taskId,
        newDueDate: newDate,
        reason: reason.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.dialogTitle} closeLabel={t.cancel}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t.current}</p>
          <p className="mt-1 text-sm text-text-primary">
            {currentDueDate ? formatDate(`${currentDueDate}T00:00:00`) : t.currentNone}
          </p>
        </div>

        <Input
          id="task-new-due-date"
          label={t.newLabel}
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          disabled={isPending}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-due-date-reason" className="text-sm font-medium text-text-secondary">
            {t.reasonLabel}
          </label>
          <textarea
            id="task-due-date-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            rows={3}
            maxLength={TASK_DUE_DATE_REASON_MAX_LENGTH}
            placeholder={t.reasonPlaceholder}
            className="soft-control w-full resize-none px-4 py-2.5 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            {t.cancel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSubmit} isLoading={isPending}>
            {isPending ? t.saving : t.save}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
