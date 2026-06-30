import { z } from "zod";
import { TASK_DUE_DATE_REASON_MAX_LENGTH } from "../constants/task.constants";

// ── Update / extend due date ────────────────────────────────────────────────
//
// newDueDate validates a real calendar date in "YYYY-MM-DD" form (z.string().date()
// rejects 2026-02-31 etc.), matching the DATE column on public.todos.
// reason is optional and bounded — mirrors the CHECK on task_due_date_changes.reason.

export const updateTaskDueDateSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  newDueDate: z.string().date("Invalid date"),
  reason: z
    .string()
    .trim()
    .max(TASK_DUE_DATE_REASON_MAX_LENGTH, `Reason must be ${TASK_DUE_DATE_REASON_MAX_LENGTH} characters or less`)
    .optional(),
});

export type UpdateTaskDueDateInput = z.infer<typeof updateTaskDueDateSchema>;
