export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_RELATION_TYPES = ["blocks", "blocked_by", "relates_to", "duplicates"] as const;
export type TaskRelationType = (typeof TASK_RELATION_TYPES)[number];

export const TASK_FILTERS = ["all", "active", "completed", "overdue"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_COMMENT_MAX_LENGTH = 5000;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo:        "To Do",
  in_progress: "In Progress",
  in_review:   "In Review",
  done:        "Done",
  cancelled:   "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
};

// Статусы, которые считаются "завершёнными" для summary
export const COMPLETED_STATUSES: TaskStatus[] = ["done", "cancelled"];

// Статусы, которые считаются "активными"
export const ACTIVE_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review"];
