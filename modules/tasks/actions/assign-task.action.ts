"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";

const assignSchema = z.object({
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
});

/** Снять задачу + конкретную задачу из кэша после изменения ответственных. */
function revalidateTask(taskId: string) {
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${taskId}`);
}

/**
 * Назначить ответственного. Добавляет нового assignee, НЕ удаляя существующих.
 * Идемпотентно: повторное назначение того же пользователя не создаёт дубль.
 */
export async function assignTaskAction(
  taskId: string,
  userId: string,
): Promise<{ error?: string }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org } = ctx;

  const parsed = assignSchema.safeParse({ taskId, userId });
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const supabase = await createClient();

    // RLS (can_access_task) гарантирует, что инициатор имеет доступ к задаче.
    const { data: task } = await supabase
      .from("todos")
      .select("id, title, created_by")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (!task) return { error: "Task not found" };

    // Управлять ответственными может создатель ИЛИ управляющая роль (manager+).
    const canManage = task.created_by === user.id || canDo(ctx, "data.delete");
    if (!canManage) return { error: "You don't have permission to manage assignees" };

    // Цель должна быть активным членом этой организации (не invited/suspended/чужой).
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", parsed.data.userId)
      .eq("organization_id", org.id)
      .eq("status", "active")
      .single();

    if (!membership) return { error: "User is not an active member of this organization" };

    // Идемпотентный INSERT: дубликат (task_id,user_id) игнорируется.
    const { data: inserted, error } = await supabase
      .from("task_assignees")
      .upsert(
        {
          task_id:     parsed.data.taskId,
          user_id:     parsed.data.userId,
          assigned_by: user.id,
        },
        { onConflict: "task_id,user_id", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      console.error("assignTask error:", error);
      return { error: "Failed to assign task" };
    }

    // Повторное назначение идемпотентно: не создаём ложную активность.
    if (!inserted?.length) return {};

    // Состав ответственных — изменение задачи, поэтому обновляем Last updated.
    const { error: touchError } = await supabase
      .from("todos")
      .update({ updated_by: user.id })
      .eq("id", task.id)
      .eq("organization_id", org.id);
    if (touchError) console.error("assignTask touch task error:", touchError);

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "task.assigned",
        aggregateType:  "task",
        aggregateId:    task.id,
        payload:        { title: task.title, assignee_id: parsed.data.userId },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       task.id,
        action:         "assign",
        newData:        { assignee_id: parsed.data.userId },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("assignTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidateTask(parsed.data.taskId);
  return {};
}

/**
 * Снять ответственного. Через транзакционную RPC remove_task_assignee:
 *  - автор/assignee может снять себя;
 *  - создатель и управляющие роли снимают других;
 *  - последнего ответственного снять нельзя (инвариант держится в БД).
 */
export async function unassignTaskAction(
  taskId: string,
  userId: string,
): Promise<{ error?: string }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { org } = ctx;

  const parsed = assignSchema.safeParse({ taskId, userId });
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const supabase = await createClient();

    // Загружаем заголовок для события/лога (если нет доступа — RLS вернёт null).
    const { data: task } = await supabase
      .from("todos")
      .select("id, title")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (!task) return { error: "Task not found" };

    const { data: result, error } = await supabase.rpc("remove_task_assignee", {
      p_task_id: parsed.data.taskId,
      p_user_id: parsed.data.userId,
    });

    if (error) {
      console.error("unassignTask rpc error:", error);
      return { error: "Failed to unassign task" };
    }

    const res = (result ?? {}) as { ok?: boolean; error?: string };
    if (!res.ok) {
      switch (res.error) {
        case "last_assignee": return { error: "A task must have at least one assignee" };
        case "forbidden":     return { error: "You don't have permission to remove this assignee" };
        case "not_assignee":  return { error: "User is not an assignee" };
        case "not_found":     return { error: "Task not found" };
        default:              return { error: "Failed to unassign task" };
      }
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "task.unassigned",
        aggregateType:  "task",
        aggregateId:    task.id,
        payload:        { title: task.title, assignee_id: parsed.data.userId },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       task.id,
        action:         "unassign",
        oldData:        { assignee_id: parsed.data.userId },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("unassignTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidateTask(parsed.data.taskId);
  return {};
}
