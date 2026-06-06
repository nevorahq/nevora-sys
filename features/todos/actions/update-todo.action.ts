"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTodoSchemas } from "../schemas/todo.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: обновить todo.
 * updateTodoSchema (partial) — все поля опциональны.
 * todoId передаётся через hidden input.
 */
export async function updateTodoAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { updateTodoSchema } = getTodoSchemas(dict.todos.errors);

  await requireUser();

  const todoId = formData.get("todoId") as string;

  if (!todoId) {
    return { error: dict.todos.errors.updateFailed };
  }

  const rawData = {
    title: formData.get("title") as string | undefined,
    description: formData.get("description") as string | undefined,
    priority: formData.get("priority") as string | undefined,
    due_date: (formData.get("due_date") as string) || null,
  };

  const cleanData = Object.fromEntries(
    Object.entries(rawData).filter(([, v]) => v !== undefined),
  );

  const parsed = updateTodoSchema.safeParse(cleanData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("todos")
      .update(parsed.data)
      .eq("id", todoId);

    if (error) {
      console.error("updateTodo error:", error);
      return { error: dict.todos.errors.updateFailed };
    }
  } catch (err) {
    console.error("updateTodo unexpected error:", err);
    return { error: dict.todos.errors.serverError };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
