import type {
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
