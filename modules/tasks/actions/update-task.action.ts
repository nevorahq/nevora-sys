"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitAuditLog } from "@/lib/events";
import { updateTaskSchema } from "../schemas/task.schema";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

// Поля, изменения которых мы отслеживаем в audit log.
const TRACKED_FIELDS = ["title", "description", "priority", "status", "due_date"] as const;

export async function updateTaskAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org } = ctx;

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

    // Загружаем прежние значения (RLS: вернётся только при наличии доступа).
    const { data: existing, error: fetchError } = await supabase
      .from("todos")
      .select("title, description, priority, status, due_date")
      .eq("id", taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) return { error: "Task not found" };

    // Оставляем только реально изменившиеся поля.
    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    for (const field of TRACKED_FIELDS) {
      if (!(field in parsed.data)) continue;
      const next = (parsed.data as Record<string, unknown>)[field];
      const prev = (existing as Record<string, unknown>)[field];
      if (next !== prev) {
        oldData[field] = prev;
        newData[field] = next;
      }
    }

    // Нечего менять — не пишем событие и не дёргаем БД.
    if (Object.keys(newData).length === 0) return {};

    const { error } = await supabase
      .from("todos")
      .update({ ...newData, updated_by: user.id })
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
      oldData,
      newData,
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("updateTask unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${taskId}`);
  return {};
}
