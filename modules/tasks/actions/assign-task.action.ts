"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { z } from "zod";

const assignSchema = z.object({
  taskId:  z.string().uuid(),
  userId:  z.string().uuid(),
});

export async function assignTaskAction(
  taskId: string,
  userId: string,
): Promise<{ error?: string }> {
  const { user, org } = await requireOrg();

  const parsed = assignSchema.safeParse({ taskId, userId });
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const supabase = await createClient();

    // Проверяем что задача в org
    const { data: task } = await supabase
      .from("todos")
      .select("id, title")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (!task) return { error: "Task not found" };

    // Проверяем что user — активный член org
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", parsed.data.userId)
      .eq("organization_id", org.id)
      .eq("status", "active")
      .single();

    if (!membership) return { error: "User is not a member of this organization" };

    const { error } = await supabase
      .from("task_assignees")
      .upsert({
        task_id:     parsed.data.taskId,
        user_id:     parsed.data.userId,
        assigned_by: user.id,
      }, { onConflict: "task_id,user_id" });

    if (error) {
      console.error("assignTask error:", error);
      return { error: "Failed to assign task" };
    }

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

  revalidatePath(ROUTES.tasks);
  return {};
}

export async function unassignTaskAction(
  taskId: string,
  userId: string,
): Promise<{ error?: string }> {
  const { org } = await requireOrg();

  const parsed = assignSchema.safeParse({ taskId, userId });
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", parsed.data.taskId)
      .eq("user_id", parsed.data.userId);

    if (error) {
      console.error("unassignTask error:", error);
      return { error: "Failed to unassign task" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "todos",
      entityId:       parsed.data.taskId,
      action:         "unassign",
      oldData:        { assignee_id: parsed.data.userId },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("unassignTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.tasks);
  return {};
}
