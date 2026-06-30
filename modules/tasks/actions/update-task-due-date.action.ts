"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { updateTaskDueDateSchema } from "../schemas/task-due-date.schema";
import { resolveDueDateChange } from "../lib/resolve-due-date-change";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import type { TaskStatus } from "../constants/task.constants";

export interface UpdateTaskDueDateInput {
  taskId: string;
  newDueDate: string;
  reason?: string;
}

/**
 * Изменить / продлить срок исполнения задачи — полноценное бизнес-действие.
 *
 * Это НЕ простое редактирование поля due_date: действие проверяет доступ и
 * права, классифицирует изменение (set/extended/shortened), пишет неизменяемую
 * историю в task_due_date_changes, эмитит domain event + audit log и
 * ревалидирует списки задач (smart-sort/overdue пересчитываются на чтении).
 *
 * Безопасность:
 *   • organization_id / workspace_id берутся ТОЛЬКО из серверного контекста.
 *   • задача загружается со скоупом по org + deleted_at IS NULL (RLS дублирует).
 *   • срок можно задавать/менять ТОЛЬКО когда задача в статусе in_progress:
 *     todo ещё не в работе, done уже закрыта.
 */
export async function updateTaskDueDateAction(
  input: UpdateTaskDueDateInput,
): Promise<ActionResult> {
  const ctx = await requireOrg();
  const { user, org, workspace, permissions } = ctx;

  // Базовое право на запись данных (зеркалит can_write_data RLS).
  // TODO(perm): заменить на гранулярный requirePermission("task.due_date.update")
  // когда появится permission engine с таким правом.
  if (!permissions.has("data.write")) {
    return { error: "You don't have permission to change due dates" };
  }

  const parsed = updateTaskDueDateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { taskId, newDueDate, reason } = parsed.data;

  let affectedProjectId: string | null = null;
  try {
    const supabase = await createClient();

    const { data: task, error: fetchError } = await supabase
      .from("todos")
      .select("id, title, status, due_date, project_id")
      .eq("id", taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !task) {
      return { error: "Task not found" };
    }

    affectedProjectId = (task.project_id as string | null) ?? null;
    const oldDueDate = (task.due_date as string | null) ?? null;

    // Срок исполнения можно устанавливать/менять только когда задача в работе.
    // todo → ещё не начата; done → уже закрыта.
    if ((task.status as TaskStatus) !== "in_progress") {
      return {
        error: (task.status as TaskStatus) === "done"
          ? "This task is closed. Reopen it to change the due date."
          : "Move the task to In progress to set a due date.",
      };
    }

    const changeType = resolveDueDateChange(oldDueDate, newDueDate);
    if (changeType === null) {
      // Та же дата — не считаем изменением, не пишем историю/событие.
      return { error: "Pick a date different from the current one" };
    }

    const { error: updateError } = await supabase
      .from("todos")
      .update({ due_date: newDueDate, updated_by: user.id })
      .eq("id", taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null);

    if (updateError) {
      console.error("updateTaskDueDate error:", updateError);
      return { error: "Failed to update due date" };
    }

    // История изменения срока (org/workspace — из контекста, не из клиента).
    const { error: historyError } = await supabase
      .from("task_due_date_changes")
      .insert({
        organization_id: org.id,
        workspace_id:    workspace.id,
        task_id:         taskId,
        old_due_date:    oldDueDate,
        new_due_date:    newDueDate,
        change_type:     changeType,
        reason:          reason ?? null,
        changed_by:      user.id,
      });

    if (historyError) {
      // История важна, но не критична для самого изменения — логируем, не
      // откатываем (due_date уже обновлён). Event/audit ниже всё равно фиксируют факт.
      console.error("updateTaskDueDate history insert failed:", historyError);
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "task.due_date_changed",
        aggregateType:  "task",
        aggregateId:    taskId,
        payload: {
          title:        task.title as string,
          old_due_date: oldDueDate,
          new_due_date: newDueDate,
          change_type:  changeType,
          reason:       reason ?? null,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       taskId,
        action:         "update",
        oldData:        { due_date: oldDueDate },
        newData:        { due_date: newDueDate, change_type: changeType, reason: reason ?? null },
        metadata:       { source: "dashboard", sub_action: "due_date_change" },
      }),
    ]);
  } catch (err) {
    console.error("updateTaskDueDate unexpected error:", err);
    return { error: "Server error" };
  }

  // due_date изменился → smart-sort/overdue пересчитываются при следующем чтении.
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.projects);
  revalidatePath(`${ROUTES.tasks}/${taskId}`);
  if (affectedProjectId) revalidatePath(projectDetailUrl(affectedProjectId));
  return {};
}
