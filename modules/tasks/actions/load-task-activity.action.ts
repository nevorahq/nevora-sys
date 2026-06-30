"use server";

import { requireOrg } from "@/lib/auth/require-org";
import { uuidSchema } from "@/lib/validators/common";
import { getTaskActivityView, type TaskActivityViewResult } from "../queries/get-task-activity-view";

/**
 * Подгружает следующую страницу активности задачи (для кнопки «Show more»).
 * Доступ проверяется на уровне RPC get_task_activity (can_access_task).
 */
export async function loadTaskActivityAction(
  taskId: string,
  offset: number,
): Promise<TaskActivityViewResult> {
  await requireOrg();

  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { items: [], hasMore: false, error: "invalid" };

  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return getTaskActivityView(parsed.data, safeOffset);
}
