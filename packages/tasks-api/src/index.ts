import type {
  CreateGeneratedTaskInput,
  CreateStandardTaskInput,
  CreateStandardTaskResult,
  GeneratedTaskMutationResult,
  RetireGeneratedTasksInput,
  Task,
  TaskPriority,
  TaskSort,
  TaskStatus,
  TaskWithDetails,
  UpdateGeneratedTaskDueDateInput,
} from "@nevora/tasks-contracts";

/** Authenticated tenant identity resolved by a trusted transport adapter. */
export interface TasksRequestContext {
  organizationId: string;
  workspaceId: string;
  actorId: string;
  permissions: readonly string[];
}

export interface TasksListInput {
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  onlyActive?: boolean;
  sort?: TaskSort;
  limit?: number;
  offset?: number;
}

/**
 * Bound server API for the Tasks product.
 *
 * The context is supplied by trusted server infrastructure, not by individual
 * method payloads. That prevents callers from selecting another organization
 * while keeping the interface usable by in-process and HTTP adapters.
 */
export interface TasksApplication {
  readonly context: Readonly<TasksRequestContext>;

  getTask(taskId: string): Promise<TaskWithDetails | null>;
  listTasks(input?: TasksListInput): Promise<Task[]>;

  createStandardTask(input: CreateStandardTaskInput): Promise<CreateStandardTaskResult>;
  createGeneratedTask(input: CreateGeneratedTaskInput): Promise<GeneratedTaskMutationResult>;
  updateGeneratedTaskDueDate(input: UpdateGeneratedTaskDueDateInput): Promise<boolean>;
  retireGeneratedTasks(input: RetireGeneratedTasksInput): Promise<number>;
}

/** A transport or deployment supplies one bound application per trusted context. */
export type TasksApplicationFactory = (
  context: TasksRequestContext,
) => TasksApplication | Promise<TasksApplication>;

export * from "./http";
export * from "./service-auth";
export * from "./execute";
