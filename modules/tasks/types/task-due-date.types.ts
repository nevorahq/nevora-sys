import type { TaskDueDateChangeType } from "../constants/task.constants";

/** Row of public.task_due_date_changes — immutable due-date change history. */
export interface TaskDueDateChange {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  task_id: string;
  old_due_date: string | null;
  new_due_date: string | null;
  change_type: TaskDueDateChangeType;
  reason: string | null;
  changed_by: string;
  changed_at: string;
}
