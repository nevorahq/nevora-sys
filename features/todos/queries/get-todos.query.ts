import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Todo } from "@/entities/todo/model";

/**
 * Query: получить все todos текущего пользователя.
 *
 * "server-only" — если кто-то импортирует в Client Component — build упадёт.
 *
 * RLS гарантирует: SELECT * FROM todos вернёт только todos текущего user.
 * Мы НЕ пишем .eq("user_id", ...) — RLS делает это автоматически.
 */
export async function getTodosQuery(): Promise<Todo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getTodosQuery error:", error);
    return [];
  }

  return data as Todo[];
}
