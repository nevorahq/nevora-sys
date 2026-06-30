// Server-side task sort modes. `smart_default` is the business-importance order
// (active-overdue -> high -> medium -> low -> none, closed last) and is the
// default everywhere tasks are listed.
export const TASK_SORTS = [
  "smart_default",
  "due_date_asc",
  "due_date_desc",
  "priority_desc",
  "created_at_desc",
  "created_at_asc",
] as const;

export type TaskSort = (typeof TASK_SORTS)[number];

export const DEFAULT_TASK_SORT: TaskSort = "smart_default";

// UI labels (Russian product copy per spec). The selector maps these 1:1.
export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  smart_default:   "По умолчанию",
  due_date_asc:    "По сроку",
  priority_desc:   "По приоритету",
  created_at_desc: "Сначала новые",
  created_at_asc:  "Сначала старые",
  // Available programmatically; not surfaced in the MVP selector.
  due_date_desc:   "По сроку (поздние)",
};

// The subset shown in the MVP selector, in display order.
export const TASK_SORT_OPTIONS: TaskSort[] = [
  "smart_default",
  "due_date_asc",
  "priority_desc",
  "created_at_desc",
  "created_at_asc",
];

// Priority -> weight mapping mirrored in SQL (todos.priority_weight). Kept here
// so any server-side TS comparison stays in sync with the database.
export const PRIORITY_WEIGHT: Record<string, number> = {
  high: 1,
  medium: 2,
  low: 3,
};
export const PRIORITY_WEIGHT_FALLBACK = 4;
