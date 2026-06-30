// Project lifecycle. `archived` is reflected by projects.archived_at as well;
// archiving sets both status='archived' and archived_at via the archive action.
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ["low", "medium", "high"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;

// English fallback labels (UI may localize later via the i18n dictionary).
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active:    "Active",
  paused:    "Paused",
  completed: "Completed",
  archived:  "Archived",
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
};

// Statuses shown by default on the projects list (archived is hidden).
export const VISIBLE_PROJECT_STATUSES: ProjectStatus[] = ["active", "paused", "completed"];

// Curated palette for project color pickers — values are CSS-friendly tokens.
export const PROJECT_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#64748b", // slate
] as const;
