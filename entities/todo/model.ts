import type { TodoPriority } from "./constants";

/**
 * Тип Todo — как он приходит из базы данных.
 * Соответствует 1:1 колонкам таблицы public.todos в PostgreSQL.
 */
export type Todo = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  is_completed: boolean;
  priority: TodoPriority;
  due_date: string | null;
  recurrence: "none" | "monthly";
  recurrence_source_id: string | null;
  created_at: string;
  updated_at: string;
};
