"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { updateTaskSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateTaskAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org } = await requireOrg();

  const taskId = formData.get("taskId") as string;
  if (!taskId) return { error: "Task ID is required" };

  const rawData = {
    title:       formData.get("title") ?? undefined,
    description: formData.get("description") ?? undefined,
    priority:    formData.get("priority") ?? undefined,
    status:      formData.get("status") ?? undefined,
    due_date:    (formData.get("due_date") as string) || null,
  };

  const cleanData = Object.fromEntries(
    Object.entries(rawData).filter(([, v]) => v !== undefined),
  );

  const parsed = updateTaskSchema.safeParse(cleanData);

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

    const { error } = await supabase
      .from("todos")
      .update({ ...parsed.data, updated_by: user.id })
      .eq("id", taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null);

    if (error) {
      console.error("updateTask error:", error);
      return { error: "Failed to update task" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "todos",
      entityId:       taskId,
      action:         "update",
      newData:        parsed.data as Record<string, unknown>,
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("updateTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  return {};
}
