import { z } from "zod";
import {
  TODO_PRIORITIES,
  TODO_TITLE_MAX_LENGTH,
  TODO_DESCRIPTION_MAX_LENGTH,
} from "@/entities/todo/constants";

/**
 * Фабрика Zod-схем для Todo — принимает i18n-сообщения об ошибках.
 * Тот же паттерн что в auth.schema.ts.
 */
export function getTodoSchemas(errors: {
  titleRequired: string;
  titleMax: string;
  descriptionMax: string;
  invalidPriority: string;
}) {
  const createTodoSchema = z.object({
    title: z
      .string()
      .min(1, errors.titleRequired)
      .max(TODO_TITLE_MAX_LENGTH, errors.titleMax),
    description: z
      .string()
      .max(TODO_DESCRIPTION_MAX_LENGTH, errors.descriptionMax)
      .default(""),
    priority: z.enum(TODO_PRIORITIES, {
      error: errors.invalidPriority,
    }),
    due_date: z
      .string()
      .nullable()
      .default(null),
    recurrence: z.enum(["none", "monthly"]).default("none"),
    // Optional project assignment. "" (no selection) normalizes to null.
    project_id: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null)
      .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Invalid project"),
  });

  const updateTodoSchema = createTodoSchema.partial();

  return { createTodoSchema, updateTodoSchema };
}

type Schemas = ReturnType<typeof getTodoSchemas>;
export type CreateTodoData = z.infer<Schemas["createTodoSchema"]>;
export type UpdateTodoData = z.infer<Schemas["updateTodoSchema"]>;
