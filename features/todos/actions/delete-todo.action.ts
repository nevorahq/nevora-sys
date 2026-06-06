"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { ROUTES } from "@/shared/config/routes";
import { uuidSchema } from "@/lib/validators/common";

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

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", todoId);

    if (error) {
      console.error("deleteTodo error:", error);
      return { error: "Failed to delete todo" };
    }
  } catch (err) {
    console.error("deleteTodo unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
