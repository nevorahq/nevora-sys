import type { TodoPriority } from "./constants";
import type { TaskStatus } from "@/modules/tasks/constants/task.constants";

/**
 * Тип Todo — как он приходит из базы данных.
 * Соответствует 1:1 колонкам таблицы public.todos в PostgreSQL.
 */
export type Todo = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  // `status` — источник истины жизненного цикла задачи (todo/in_progress/done).
  // `is_completed` оставлен для обратной совместимости и зеркалит `done`.
  status: TaskStatus;
  is_completed: boolean;
  priority: TodoPriority;
  due_date: string | null;
  recurrence: "none" | "monthly";
  recurrence_source_id: string | null;
  // Optional project this task belongs to. `project` is the joined preview
  // (name + color) used for the project badge; null when unassigned.
  project_id: string | null;
  project?: { id: string; name: string; color: string | null; status: string } | null;
  created_at: string;
  updated_at: string;
};
