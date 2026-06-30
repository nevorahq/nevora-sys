"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";
import { uuidSchema } from "@/lib/validators/common";
import { recalculateProjectProgress } from "@/modules/tasks/projects/services/recalculate-project-progress";

/**
 * Server Action: удалить todo.
 *
 * RLS: DELETE WHERE id = ? → RLS добавит AND user_id = auth.uid().
 * Попытка удалить чужой todo = 0 affected rows, не ошибка.
 */
export async function deleteTodoAction(
  todoId: string,
): Promise<{ error?: string }> {
  await requireUser();

  const parsed = uuidSchema.safeParse(todoId);
  if (!parsed.success) {
    return { error: "Invalid todo ID" };
  }

  let affectedProjectId: string | null = null;
  try {
    const supabase = await createClient();

    // Capture the project before deletion so its progress can be recomputed.
    const { data: existing } = await supabase
      .from("todos")
      .select("project_id")
      .eq("id", todoId)
      .maybeSingle();
    affectedProjectId = (existing?.project_id as string | null) ?? null;

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", todoId);

    if (error) {
      console.error("deleteTodo error:", error);
      return { error: "Failed to delete todo" };
    }

    await recalculateProjectProgress(supabase, affectedProjectId);
  } catch (err) {
    console.error("deleteTodo unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.projects);
  if (affectedProjectId) revalidatePath(projectDetailUrl(affectedProjectId));
  return {};
}
