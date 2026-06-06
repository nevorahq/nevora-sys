"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTodoSchemas } from "../schemas/todo.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать новый todo.
 *
 * 1. requireUser() — defense in depth
 * 2. Zod validation
 * 3. Supabase INSERT (RLS проверит user_id)
 * 4. revalidatePath — обновить Server Component
 */
export async function createTodoAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createTodoSchema } = getTodoSchemas(dict.todos.errors);

  const user = await requireUser();

  const rawData = {
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || "",
    priority: formData.get("priority") as string,
    due_date: (formData.get("due_date") as string) || null,
  };

  const parsed = createTodoSchema.safeParse(rawData);

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

    const { error } = await supabase.from("todos").insert({
      user_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date,
    });

    if (error) {
      console.error("createTodo error:", error);
      return { error: dict.todos.errors.createFailed };
    }
  } catch (err) {
    console.error("createTodo unexpected error:", err);
    return { error: dict.todos.errors.serverError };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
