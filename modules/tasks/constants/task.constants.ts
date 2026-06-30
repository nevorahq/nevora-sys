// Three-state task lifecycle. `status` is the single source of truth;
// `todos.is_completed` is kept only for backward-compat and mirrors `done`
// via the DB trigger (migration 055).
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_RELATION_TYPES = ["blocks", "blocked_by", "relates_to", "duplicates"] as const;
export type TaskRelationType = (typeof TASK_RELATION_TYPES)[number];

export const TASK_FILTERS = ["all", "active", "completed", "overdue"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

// Classification of a due-date change, stored in task_due_date_changes.change_type.
//   set       — task had no due date, now one is set
//   extended  — new date is later than the old one (deadline extension)
//   shortened — new date is earlier than the old one
//   changed   — generic change (fallback)
//   removed   — due date cleared (reserved; not exposed in MVP UI)
export const TASK_DUE_DATE_CHANGE_TYPES = ["set", "extended", "shortened", "changed", "removed"] as const;
export type TaskDueDateChangeType = (typeof TASK_DUE_DATE_CHANGE_TYPES)[number];

// Max length of the optional "reason" attached to a due-date change.
// Mirrored by the CHECK constraint on task_due_date_changes.reason.
export const TASK_DUE_DATE_REASON_MAX_LENGTH = 500;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_COMMENT_MAX_LENGTH = 5000;

// English fallback labels. UI surfaces should prefer the i18n dictionary
// (dict.todos.statuses) so the labels stay localized.
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo:        "Not set",
  in_progress: "In progress",
  done:        "Closed",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
};

// Статусы, которые считаются "завершёнными" для summary
export const COMPLETED_STATUSES: TaskStatus[] = ["done"];

// Статусы, которые считаются "активными"
export const ACTIVE_STATUSES: TaskStatus[] = ["todo", "in_progress"];
