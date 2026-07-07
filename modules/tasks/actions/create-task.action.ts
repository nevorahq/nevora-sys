"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { createTaskSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createTaskAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Quota stays with the atomic reserveOrganizationUsage below (tasks.count);
  // the guard covers auth → tenant → data.write → billing entitlement.
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace } = ctx;

  const rawData = {
    title:        formData.get("title") as string,
    description:  (formData.get("description") as string) || "",
    priority:     (formData.get("priority") as string) || "medium",
    status:       (formData.get("status") as string) || "todo",
    // Срок исполнения при создании не задаётся — устанавливается отдельным
    // действием после перевода задачи в статус "in_progress".
    due_date:     null,
    recurrence:   (formData.get("recurrence") as string) || "none",
    assignee_ids: formData.getAll("assignee_ids") as string[],
  };

  const parsed = createTaskSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // Tracks a live reservation not yet backed by a persisted row. Set false the
  // moment the insert commits so post-insert failures never release a
  // legitimate count; released in the outer catch otherwise (P1-3).
  let reserved = false;
  try {
    await reserveOrganizationUsage(org.id, "tasks.count", 1);
    reserved = true;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Plan limit reached. Upgrade your plan." };
  }

  try {
    const supabase = await createClient();
    const taskId = randomUUID();

    // UUID заранее позволяет избежать INSERT ... RETURNING, который конфликтует
    // с task-scoped SELECT RLS до завершения AFTER INSERT assignee trigger.
    const { error } = await supabase
      .from("todos")
      .insert({
        id:               taskId,
        organization_id: org.id,
        workspace_id:    workspace.id,
        created_by:      user.id,
        updated_by:      user.id,
        title:           parsed.data.title,
        description:     parsed.data.description,
        priority:        parsed.data.priority,
        status:          parsed.data.status,
        due_date:        parsed.data.due_date,
        recurrence:      parsed.data.recurrence,
      });

    if (error) {
      console.error("createTask error:", error);
      await releaseOrganizationUsage(org.id, "tasks.count", 1);
      return { error: "Failed to create task" };
    }

    // Row is committed — the reservation now legitimately backs it. Any later
    // failure must NOT release, and the removal trigger handles real deletes.
    reserved = false;

    // Создатель уже добавлен в assignees триггером todos_add_creator_assignee.
    // Доп. исполнители — идемпотентно, чтобы не конфликтовать с создателем.
    if (parsed.data.assignee_ids.length > 0) {
      await supabase.from("task_assignees").upsert(
        parsed.data.assignee_ids.map((uid) => ({
          task_id:     taskId,
          user_id:     uid,
          assigned_by: user.id,
        })),
        { onConflict: "task_id,user_id", ignoreDuplicates: true },
      );
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "task.created",
        aggregateType:  "task",
        aggregateId:    taskId,
        payload: {
          title:    parsed.data.title,
          priority: parsed.data.priority,
          due_date: parsed.data.due_date ?? null,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       taskId,
        action:         "create",
        newData: {
          title:       parsed.data.title,
          priority:    parsed.data.priority,
          status:      parsed.data.status,
          due_date:    parsed.data.due_date ?? null,
        },
        metadata: { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createTask unexpected error:", err);
    if (reserved) await releaseOrganizationUsage(org.id, "tasks.count", 1);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
