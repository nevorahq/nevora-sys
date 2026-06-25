import { z } from "zod";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_RELATION_TYPES,
  TASK_TITLE_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_COMMENT_MAX_LENGTH,
} from "../constants/task.constants";

// ── Create ────────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(TASK_TITLE_MAX_LENGTH, `Title must be ${TASK_TITLE_MAX_LENGTH} characters or less`),
  description: z
    .string()
    .max(TASK_DESCRIPTION_MAX_LENGTH, `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or less`)
    .default(""),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  due_date: z.string().nullable().default(null),
  recurrence: z.enum(["none", "monthly"]).default("none"),
  assignee_ids: z.array(z.string().uuid()).default([]),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// ── Update ────────────────────────────────────────────────────────────────────

export const updateTaskSchema = createTaskSchema
  .omit({ assignee_ids: true })
  .partial();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ── Status change ─────────────────────────────────────────────────────────────

export const changeTaskStatusSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  status: z.enum(TASK_STATUSES, { error: "Invalid status" }),
});

export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>;

// ── Comment ───────────────────────────────────────────────────────────────────

export const addTaskCommentSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(TASK_COMMENT_MAX_LENGTH, `Comment must be ${TASK_COMMENT_MAX_LENGTH} characters or less`),
});

export type AddTaskCommentInput = z.infer<typeof addTaskCommentSchema>;

// ── Relation ──────────────────────────────────────────────────────────────────

export const addTaskRelationSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  relatedTaskId: z.string().uuid("Invalid related task ID"),
  relationType: z.enum(TASK_RELATION_TYPES),
}).refine((data) => data.taskId !== data.relatedTaskId, {
  message: "A task cannot be related to itself",
  path: ["relatedTaskId"],
});

export type AddTaskRelationInput = z.infer<typeof addTaskRelationSchema>;
