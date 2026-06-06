"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { ROUTES } from "@/shared/config/routes";
import { uuidSchema } from "@/lib/validators/common";

/**
 * Server Action: переключить is_completed (completed ↔ active).
 *
 * Не использует FormData — вызывается программно из onClick.
 * RLS: UPDATE WHERE id = ? → RLS добавит AND user_id = auth.uid().
 */
export async function toggleTodoAction(
  todoId: string,
  currentCompleted: boolean,
): Promise<{ error?: string }> {
  await requireUser();

  // Валидация ID — не пропускаем мусор до БД
  const parsed = uuidSchema.safeParse(todoId);
  if (!parsed.success) {
    return { error: "Invalid todo ID" };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("todos")
      .update({ is_completed: !currentCompleted })
      .eq("id", todoId);

    if (error) {
      console.error("toggleTodo error:", error);
      return { error: "Failed to toggle todo" };
    }
  } catch (err) {
    console.error("toggleTodo unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
