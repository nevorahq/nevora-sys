"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { changeTaskStatusSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { TaskStatus } from "../constants/task.constants";

export async function changeTaskStatusAction(
  taskId: string,
  newStatus: TaskStatus,
): Promise<{ error?: string }> {
  const { user, org } = await requireOrg();

  const parsed = changeTaskStatusSchema.safeParse({ taskId, status: newStatus });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const supabase = await createClient();

    const { data: task, error: fetchError } = await supabase
      .from("todos")
      .select("id, title, status")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !task) {
      return { error: "Task not found" };
    }

    const oldStatus = task.status as TaskStatus;
    if (oldStatus === parsed.data.status) {
      return {};
    }

    const { error } = await supabase
      .from("todos")
      .update({ status: parsed.data.status, updated_by: user.id })
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("changeTaskStatus error:", error);
      return { error: "Failed to update status" };
    }

    const isDone = parsed.data.status === "done";

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      isDone ? "task.completed" : "task.updated",
        aggregateType:  "task",
        aggregateId:    task.id,
        payload: isDone
          ? { title: task.title, completed_at: new Date().toISOString() }
          : { title: task.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       task.id,
        action:         "status_change",
        oldData:        { status: oldStatus },
        newData:        { status: parsed.data.status },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("changeTaskStatus unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
