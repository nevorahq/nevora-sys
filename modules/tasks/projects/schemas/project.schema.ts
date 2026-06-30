import { z } from "zod";
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_DESCRIPTION_MAX_LENGTH,
} from "../constants/project.constants";

// A date input that accepts "" (empty form field) and normalizes it to null.
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const optionalColor = z
  .string()
  .trim()
  .max(32)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// ── Create ──────────────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(PROJECT_NAME_MAX_LENGTH, `Name must be ${PROJECT_NAME_MAX_LENGTH} characters or less`),
  description: z
    .string()
    .max(PROJECT_DESCRIPTION_MAX_LENGTH, `Description must be ${PROJECT_DESCRIPTION_MAX_LENGTH} characters or less`)
    .default(""),
  status: z.enum(PROJECT_STATUSES).default("active"),
  priority: z.enum(PROJECT_PRIORITIES).default("medium"),
  start_date: optionalDate,
  due_date: optionalDate,
  color: optionalColor,
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ── Update ──────────────────────────────────────────────────────────────────

export const updateProjectSchema = z.object({
  projectId: z.string().uuid("Invalid project ID"),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(PROJECT_NAME_MAX_LENGTH, `Name must be ${PROJECT_NAME_MAX_LENGTH} characters or less`)
    .optional(),
  description: z
    .string()
    .max(PROJECT_DESCRIPTION_MAX_LENGTH, `Description must be ${PROJECT_DESCRIPTION_MAX_LENGTH} characters or less`)
    .optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  start_date: optionalDate.optional(),
  due_date: optionalDate.optional(),
  color: optionalColor.optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ── Archive ─────────────────────────────────────────────────────────────────

export const archiveProjectSchema = z.object({
  projectId: z.string().uuid("Invalid project ID"),
});

export type ArchiveProjectInput = z.infer<typeof archiveProjectSchema>;

// ── Assign / remove task ↔ project ──────────────────────────────────────────

export const assignTaskToProjectSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  // null = remove from any project. A uuid = assign to that project.
  projectId: z.string().uuid("Invalid project ID").nullable(),
});

export type AssignTaskToProjectInput = z.infer<typeof assignTaskToProjectSchema>;
