import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
} from "@nevora/tasks-contracts";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TASKS_HTTP_ENDPOINT = "/api/internal/tasks" as const;
export const TASKS_HTTP_TRANSPORT_HEADER = "x-nevora-tasks-transport" as const;
export const TASKS_HTTP_TRANSPORT_VERSION = "tasks-v1" as const;

const listInput = z.object({
  projectId: uuid.optional(),
  assigneeId: uuid.optional(),
  status: z.union([z.enum(TASK_STATUSES), z.array(z.enum(TASK_STATUSES)).min(1)]).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  onlyActive: z.boolean().optional(),
  sort: z.enum(TASK_SORTS).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
}).strict();

const createStandardInput = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: isoDate.nullable().optional(),
  sourceSuggestionId: uuid.nullable().optional(),
}).strict();

const createGeneratedInput = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: isoDate,
}).strict();

export const tasksHttpRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getTask"), input: z.object({ taskId: uuid }).strict() }).strict(),
  z.object({ operation: z.literal("listTasks"), input: listInput.optional().default({}) }).strict(),
  z.object({ operation: z.literal("createStandardTask"), input: createStandardInput }).strict(),
  z.object({ operation: z.literal("createGeneratedTask"), input: createGeneratedInput }).strict(),
  z.object({
    operation: z.literal("updateGeneratedTaskDueDate"),
    input: z.object({ taskId: uuid, dueDate: isoDate }).strict(),
  }).strict(),
  z.object({
    operation: z.literal("retireGeneratedTasks"),
    input: z.object({ taskIds: z.array(uuid).max(200), retiredAt: z.string().datetime().optional() }).strict(),
  }).strict(),
]);

export type TasksHttpRequest = z.infer<typeof tasksHttpRequestSchema>;
export type TasksHttpOperation = TasksHttpRequest["operation"];

export interface TasksHttpSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface TasksHttpFailure {
  ok: false;
  error: string;
  code?: string;
}

export type TasksHttpResponse<T = unknown> = TasksHttpSuccess<T> | TasksHttpFailure;

export function isTasksWriteOperation(operation: TasksHttpOperation): boolean {
  return !["getTask", "listTasks"].includes(operation);
}
