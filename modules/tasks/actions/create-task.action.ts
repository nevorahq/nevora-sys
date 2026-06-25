"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { checkPlanLimit } from "@/lib/billing";
import { createTaskSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createTaskAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "tasks");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Plan limit reached. Upgrade your plan." };
  }

  const rawData = {
    title:        formData.get("title") as string,
    description:  (formData.get("description") as string) || "",
    priority:     (formData.get("priority") as string) || "medium",
    status:       (formData.get("status") as string) || "todo",
    due_date:     (formData.get("due_date") as string) || null,
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

  try {
    const supabase = await createClient();

    const { data: newTask, error } = await supabase
      .from("todos")
      .insert({
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
      })
      .select("id")
      .single();

    if (error || !newTask) {
      console.error("createTask error:", error);
      return { error: "Failed to create task" };
    }

    // Назначаем исполнителей если переданы
    if (parsed.data.assignee_ids.length > 0) {
      await supabase.from("task_assignees").insert(
        parsed.data.assignee_ids.map((uid) => ({
          task_id:     newTask.id,
          user_id:     uid,
          assigned_by: user.id,
        })),
      );
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "task.created",
        aggregateType:  "task",
        aggregateId:    newTask.id,
        payload: {
          title:    parsed.data.title,
          priority: parsed.data.priority,
          due_date: parsed.data.due_date ?? null,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       newTask.id,
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
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
