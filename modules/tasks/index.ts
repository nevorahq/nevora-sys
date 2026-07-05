// Types
export type {
  Task,
  TaskAssignee,
  TaskComment,
  TaskRelation,
  TaskWithAssignees,
  TaskWithDetails,
  TaskSummary,
} from "./types/task.types";

// Constants
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

export type { TaskDueDateChange } from "./types/task-due-date.types";

// Sorting
export {
  TASK_SORTS,
  DEFAULT_TASK_SORT,
  TASK_SORT_LABELS,
  TASK_SORT_OPTIONS,
  type TaskSort,
} from "./constants/task-sort.constants";
export { taskSortSchema, parseTaskSort } from "./schemas/task-sort.schema";
export { applyTaskSort, TASK_LIST_VIEW } from "./queries/apply-task-sort";

// Schemas
export {
  createTaskSchema,
  updateTaskSchema,
  changeTaskStatusSchema,
  addTaskCommentSchema,
  addTaskRelationSchema,
} from "./schemas/task.schema";
export type {
  CreateTaskInput,
  UpdateTaskInput,
  ChangeTaskStatusInput,
  AddTaskCommentInput,
  AddTaskRelationInput,
} from "./schemas/task.schema";
export { updateTaskDueDateSchema } from "./schemas/task-due-date.schema";
export type { UpdateTaskDueDateInput } from "./schemas/task-due-date.schema";
export { resolveDueDateChange } from "./lib/resolve-due-date-change";

// Queries
export { getTasks, getTasksWithAssignees } from "./queries/get-tasks";
export type { GetTasksOptions } from "./queries/get-tasks";
export { getTaskById } from "./queries/get-task-by-id";
export { getTaskSummary } from "./queries/get-task-summary";

// Services (headless task creation for callers outside the task form, e.g. Capture Inbox)
export { createStandardTask } from "./services/create-standard-task";
export type { CreateStandardTaskInput, CreateStandardTaskResult } from "./services/create-standard-task";

// Actions
export { createTaskAction } from "./actions/create-task.action";
export { updateTaskAction } from "./actions/update-task.action";
export { deleteTaskAction } from "./actions/delete-task.action";
export { changeTaskStatusAction } from "./actions/change-task-status.action";
export { updateTaskDueDateAction } from "./actions/update-task-due-date.action";
export { addTaskCommentAction } from "./actions/add-task-comment.action";
export { assignTaskAction, unassignTaskAction } from "./actions/assign-task.action";

// ── Financial Context Tasks (migration 079) ─────────────────────────────────
export {
  TASK_CONTEXT_TYPES,
  TASK_CONTEXT_TYPE_LABELS,
  PAYABLE_CONTEXT_TYPES,
  FINANCIAL_TASK_STATUSES,
  FINANCIAL_SOURCE_TYPES,
  DEFAULT_REMINDER_OFFSET_DAYS,
  MAX_REMINDER_OFFSET_DAYS,
} from "./constants/task.constants";
export type {
  TaskContextType,
  FinancialTaskStatus,
  FinancialSourceType,
} from "./constants/task.constants";
export type { FinancialTask } from "./types/task.types";
export { isFinancialTask } from "./types/task.types";
export { calculateActionDueDate, normalizeReminderOffset } from "./services/calculate-action-due-date";
export {
  buildFinancialTaskTitle,
  buildFinancialObligationIdempotencyKey,
  buildFinancialTaskExpenseIdempotencyKey,
} from "./services/financial-task-keys";
export { createFinancialTask } from "./services/create-financial-task";
export { markFinancialTaskAsPaid } from "./services/mark-financial-task-paid";
export { resolveFinancialTask } from "./services/resolve-financial-task";
export {
  getFinancialTasks,
  getFinancialTaskSummary,
} from "./queries/get-financial-tasks";
export type { FinancialTaskSummary } from "./queries/get-financial-tasks";
export {
  createFinancialTaskSchema,
  markFinancialTaskPaidSchema,
  skipFinancialTaskSchema,
  dismissFinancialTaskSchema,
  changeFinancialDueDateSchema,
} from "./schemas/financial-task.schema";
export { createFinancialTaskFromDocumentAction } from "./actions/create-financial-task-from-document.action";
export { markFinancialTaskPaidAction } from "./actions/mark-financial-task-paid.action";
export { skipFinancialTaskAction, dismissFinancialTaskAction } from "./actions/resolve-financial-task.action";
export { FinancialTaskPanel } from "./components/financial-task-panel";
export { FinancialTaskCard } from "./components/financial-task-card";
