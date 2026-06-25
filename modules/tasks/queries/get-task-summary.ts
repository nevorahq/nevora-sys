import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TaskSummary } from "../types/task.types";
import type { TaskStatus } from "../constants/task.constants";
import { TASK_STATUSES, ACTIVE_STATUSES, COMPLETED_STATUSES } from "../constants/task.constants";

export async function getTaskSummary(orgId: string): Promise<TaskSummary> {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("todos")
    .select("status, due_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (error) {
    console.error("getTaskSummary error:", error);
    return {
      total: 0,
      active: 0,
      completed: 0,
      overdue: 0,
      dueToday: 0,
      byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>,
    };
  }

  const tasks = data ?? [];

  const byStatus = Object.fromEntries(
    TASK_STATUSES.map((s) => [s, 0]),
  ) as Record<TaskStatus, number>;

  let overdue = 0;
  let dueToday = 0;

  for (const task of tasks) {
    const status = task.status as TaskStatus;
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    if (ACTIVE_STATUSES.includes(status) && task.due_date) {
      if (task.due_date < today) overdue++;
      if (task.due_date === today) dueToday++;
    }
  }

  const completed = COMPLETED_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);

  return {
    total: tasks.length,
    active,
    completed,
    overdue,
    dueToday,
    byStatus,
  };
}
