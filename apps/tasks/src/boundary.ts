import type { TasksApplication } from "@nevora/tasks-api";

/** Current readiness of the first separately extractable application. */
export const TASKS_EXTRACTION_STAGE = "standalone_runtime_ready" as const;

/**
 * Stable transport contract implemented by the standalone Tasks runtime.
 */
export type TasksApplicationBoundary = TasksApplication;
