"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { getTodoSchemas } from "../schemas/todo.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { uuidSchema, type ActionResult } from "@/lib/validators/common";

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

  const { user, org } = await requireOrg();

  const todoId = formData.get("todoId") as string;

  if (!uuidSchema.safeParse(todoId).success) {
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

    const { data: existing, error: fetchError } = await supabase
      .from("todos")
      .select("title, description, priority, due_date")
      .eq("id", todoId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) {
      return { error: dict.todos.errors.updateFailed };
    }

    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    for (const [field, next] of Object.entries(parsed.data)) {
      const previous = existing[field as keyof typeof existing];
      if (next !== previous) {
        oldData[field] = previous;
        newData[field] = next;
      }
    }

    if (Object.keys(newData).length === 0) return {};

    const { error } = await supabase
      .from("todos")
      .update({ ...newData, updated_by: user.id })
      .eq("id", todoId)
      .eq("organization_id", org.id)
      .is("deleted_at", null);

    if (error) {
      console.error("updateTodo error:", error);
      return { error: dict.todos.errors.updateFailed };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType: "todos",
      entityId: todoId,
      action: "update",
      oldData,
      newData,
      metadata: { source: "dashboard" },
    });
  } catch (err) {
    console.error("updateTodo unexpected error:", err);
    return { error: dict.todos.errors.serverError };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${todoId}`);
  return {};
}
