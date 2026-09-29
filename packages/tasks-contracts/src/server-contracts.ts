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
  /**
   * Project the task belongs to (ADR 002, 0.2b). Must be a non-archived project
   * of the bound organization; the task is then created in THAT project's
   * workspace, not the caller's default one. Omitted/null → no project.
   */
  projectId?: string | null;
}

export type CreateStandardTaskResult =
  | { ok: true; taskId: string; created: boolean }
  /** `project_not_found`: the project is missing, archived or in another organization. */
  | { ok: false; error: string; code?: "project_not_found" };

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
