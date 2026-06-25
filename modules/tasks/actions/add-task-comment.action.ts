"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { addTaskCommentSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function addTaskCommentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org } = await requireOrg();

  const rawData = {
    taskId:  formData.get("taskId") as string,
    content: formData.get("content") as string,
  };

  const parsed = addTaskCommentSchema.safeParse(rawData);

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

    // Проверяем что задача принадлежит org (защита от cross-tenant)
    const { data: task } = await supabase
      .from("todos")
      .select("id")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (!task) {
      return { error: "Task not found" };
    }

    const { data: comment, error } = await supabase
      .from("task_comments")
      .insert({
        task_id:         parsed.data.taskId,
        organization_id: org.id,
        user_id:         user.id,
        content:         parsed.data.content,
      })
      .select("id")
      .single();

    if (error || !comment) {
      console.error("addTaskComment error:", error);
      return { error: "Failed to add comment" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "task_comments",
      entityId:       comment.id,
      action:         "create",
      newData:        { task_id: parsed.data.taskId, content_length: parsed.data.content.length },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("addTaskComment unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.tasks);
  return {};
}
