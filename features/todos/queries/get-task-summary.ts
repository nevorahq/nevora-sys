import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Query: получить summary по задачам для dashboard overview.
 *
 * Возвращает агрегаты, НЕ полный список задач.
 * Dashboard не должен знать про каждую задачу —
 * ему нужны только числа для карточек.
 *
 * - total: всего задач
 * - completed: завершённых
 * - active: незавершённых
 * - overdue: просроченных (due_date < today AND is_completed = false)
 * - dueToday: задачи с дедлайном сегодня
 */
export type TaskSummary = {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  dueToday: number;
};

export async function getTaskSummary(organizationId: string): Promise<TaskSummary> {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  // Один запрос — все todos, считаем агрегаты в коде.
  // Для MVP (десятки-сотни задач) это быстрее чем 4 отдельных COUNT-запроса.
  // При масштабировании — вынести в PostgreSQL function.
  //
  // RLS (is_org_member) допускает любую org пользователя — при active
  // membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
  // organizationId обязателен, иначе overdue-бейдж смешает задачи разных org.
  const { data, error } = await supabase
    .from("todos")
    .select("status, due_date")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("getTaskSummary error:", error);
    return { total: 0, completed: 0, active: 0, overdue: 0, dueToday: 0 };
  }

  const todos = data ?? [];

  let completed = 0;
  let active = 0;
  let overdue = 0;
  let dueToday = 0;

  // status — источник истины: done = завершена, остальное = активна.
  for (const todo of todos) {
    if (todo.status === "done") {
      completed++;
    } else {
      active++;
      if (todo.due_date) {
        if (todo.due_date < today) overdue++;
        if (todo.due_date === today) dueToday++;
      }
    }
  }

  return {
    total: todos.length,
    completed,
    active,
    overdue,
    dueToday,
  };
}
