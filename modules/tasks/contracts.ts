/** Stable, runtime-safe public contracts for the Tasks product. */

export type {
  Task,
  TaskAssignee,
  TaskComment,
  TaskRelation,
  TaskWithAssignees,
  TaskWithDetails,
  TaskSummary,
} from "./types/task.types";
export type { TaskDueDateChange } from "./types/task-due-date.types";

export {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_RELATION_TYPES,
  TASK_FILTERS,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  TASK_TITLE_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_COMMENT_MAX_LENGTH,
  TASK_DUE_DATE_CHANGE_TYPES,
  TASK_DUE_DATE_REASON_MAX_LENGTH,
} from "./constants/task.constants";
export type {
  TaskStatus,
  TaskPriority,
  TaskRelationType,
  TaskFilter,
  TaskDueDateChangeType,
} from "./constants/task.constants";

export {
  TASK_SORTS,
  DEFAULT_TASK_SORT,
  TASK_SORT_LABELS,
  TASK_SORT_OPTIONS,
  type TaskSort,
} from "./constants/task-sort.constants";
export { taskSortSchema, parseTaskSort } from "./schemas/task-sort.schema";
export { updateTaskDueDateSchema } from "./schemas/task-due-date.schema";
export type { UpdateTaskDueDateInput } from "./schemas/task-due-date.schema";

export type { Project, ProjectWithStats, ProjectRef } from "./projects/types/project.types";
export {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_COLORS,
  VISIBLE_PROJECT_STATUSES,
  type ProjectStatus,
  type ProjectPriority,
} from "./projects/constants/project.constants";
