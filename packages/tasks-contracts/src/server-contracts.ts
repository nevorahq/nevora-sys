import type {
  FinancialSourceType,
  TaskContextType,
  TaskPriority,
  TaskStatus,
} from "./task-constants";

/** Portable input for creating an ordinary task through the Tasks server API. */
export interface CreateStandardTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  sourceSuggestionId?: string | null;
}

export type CreateStandardTaskResult =
  | { ok: true; taskId: string; created: boolean }
  | { ok: false; error: string };

/** Portable input for a planned financial obligation; it never posts money. */
export interface CreateFinancialTaskCommand {
  contextType: Exclude<TaskContextType, "standard">;
  providerName: string | null;
  amount: number | null;
  currency: string | null;
  financialDueDate: string;
  reminderOffsetDays?: number;
  sourceType: FinancialSourceType;
  sourceId: string | null;
  sourceDocumentId?: string | null;
  confidence?: number | null;
  title?: string;
}

export type CreateFinancialTaskResult =
  | { ok: true; taskId: string; created: boolean; actionDueDate: string | null }
  | { ok: false; error: string };

export interface CreateGeneratedTaskInput {
  title: string;
  dueDate: string;
  workspaceId?: string | null;
}

export interface UpdateGeneratedTaskDueDateInput {
  taskId: string;
  dueDate: string;
}

export interface RetireGeneratedTasksInput {
  taskIds: string[];
  retiredAt?: string;
}

export type GeneratedTaskMutationResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };
