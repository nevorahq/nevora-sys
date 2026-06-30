import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AuditAction } from "@/lib/events";

export const TASK_ACTIVITY_PAGE_SIZE = 50;

export interface TaskActivityActor {
  id: string;
  name: string | null;
}

export interface TaskActivityItem {
  id: string;
  action: AuditAction;
  actor: TaskActivityActor;
  /** Целевой пользователь для assign/unassign (может совпадать с actor). */
  target: TaskActivityActor | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskActivityResult {
  items: TaskActivityItem[];
  hasMore: boolean;
  error?: string;
}

interface AuditRow {
  id: string;
  user_id: string;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

function assigneeId(data: Record<string, unknown> | null): string | null {
  const v = data?.assignee_id;
  return typeof v === "string" ? v : null;
}

/**
 * Безопасно читает историю активности задачи.
 *
 * Источник — существующий audit_logs через RPC get_task_activity, которая
 * сначала проверяет доступ к задаче (can_access_task) и возвращает ТОЛЬКО
 * события этой задачи, не раскрывая общий журнал организации.
 *
 * Запрашиваем limit+1, чтобы определить hasMore для кнопки «Show more».
 */
export async function getTaskActivity(
  taskId: string,
  { limit = TASK_ACTIVITY_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<TaskActivityResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_task_activity", {
    p_task_id: taskId,
    p_limit:   limit + 1,
    p_offset:  offset,
  });

  if (error) {
    // 42501 = доступ запрещён (can_access_task вернул false).
    console.error("getTaskActivity error:", error.message);
    return { items: [], hasMore: false, error: "forbidden" };
  }

  const rows = (data ?? []) as AuditRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Собираем всех упоминаемых пользователей: инициаторы + цели assign/unassign.
  const userIds = new Set<string>();
  for (const row of page) {
    userIds.add(row.user_id);
    const target = assigneeId(row.new_data) ?? assigneeId(row.old_data);
    if (target) userIds.add(target);
  }

  const nameMap = new Map<string, string | null>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...userIds]);
    for (const p of profiles ?? []) {
      nameMap.set(p.id as string, (p.display_name as string | null)?.trim() || null);
    }
  }

  const items: TaskActivityItem[] = page.map((row) => {
    const targetId = assigneeId(row.new_data) ?? assigneeId(row.old_data);
    return {
      id:        row.id,
      action:    row.action,
      actor:     { id: row.user_id, name: nameMap.get(row.user_id) ?? null },
      target:    targetId ? { id: targetId, name: nameMap.get(targetId) ?? null } : null,
      oldData:   row.old_data,
      newData:   row.new_data,
      createdAt: row.created_at,
    };
  });

  return { items, hasMore };
}
