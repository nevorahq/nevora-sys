"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { recordTaskDeletionInActionCenter } from "@/modules/action-center/services/record-task-deletion";

export async function deleteTaskAction(
  taskId: string,
): Promise<{ error?: string }> {
  // Task "delete" is a soft-delete (UPDATE deleted_at), governed by
  // can_write_data — so data.write, not data.delete (preserves member access).
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org } = ctx;

  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { error: "Invalid task ID" };

  try {
    const supabase = await createClient();

    const { data: task, error: fetchError } = await supabase
      .from("todos")
      .select("id, title")
      .eq("id", parsed.data)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !task) {
      return { error: "Task not found" };
    }

    const { error } = await supabase
      .from("todos")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", parsed.data)
      .eq("organization_id", org.id);

    if (error) {
      console.error("deleteTask error:", error);
      return { error: "Failed to delete task" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "task.deleted",
        aggregateType:  "task",
        aggregateId:    task.id,
        payload:        { title: task.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       task.id,
        action:         "delete",
        oldData:        { title: task.title },
        metadata:       { source: "dashboard" },
      }),
      recordTaskDeletionInActionCenter(supabase, ctx, {
        taskId: task.id as string,
        title: task.title as string,
      }),
    ]);
  } catch (err) {
    console.error("deleteTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.actions);
  return {};
}
