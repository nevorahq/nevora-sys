"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { TODO_DESCRIPTION_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from "@/entities/todo/constants";

const inlineUpdateSchema = z.discriminatedUnion("field", [
  z.object({
    taskId: z.string().uuid(),
    field: z.literal("title"),
    value: z.string().trim().min(1).max(TODO_TITLE_MAX_LENGTH),
  }),
  z.object({
    taskId: z.string().uuid(),
    field: z.literal("description"),
    value: z.string().max(TODO_DESCRIPTION_MAX_LENGTH),
  }),
]);

export type InlineTaskField = "title" | "description";

/** Частичное inline-обновление одного поля задачи. */
export async function updateTaskInlineAction(
  taskId: string,
  field: InlineTaskField,
  value: string,
): Promise<{ error?: string; value?: string }> {
  const parsed = inlineUpdateSchema.safeParse({ taskId, field, value });
  if (!parsed.success) return { error: "Invalid task value" };

  const { user, org } = await requireOrg();
  const supabase = await createClient();

  const { data: task, error: fetchError } = await supabase
    .from("todos")
    .select("id, title, description")
    .eq("id", parsed.data.taskId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !task) return { error: "Task not found" };

  const nextValue = parsed.data.value;
  const previousValue = task[parsed.data.field] ?? "";
  if (previousValue === nextValue) return { value: nextValue };

  const { data: updated, error: updateError } = await supabase
    .from("todos")
    .update({ [parsed.data.field]: nextValue, updated_by: user.id })
    .eq("id", parsed.data.taskId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("updateTaskInline error:", updateError);
    return { error: "Failed to update task" };
  }

  await emitAuditLog({
    organizationId: org.id,
    entityType: "todos",
    entityId: parsed.data.taskId,
    action: "update",
    oldData: { [parsed.data.field]: previousValue },
    newData: { [parsed.data.field]: nextValue },
    metadata: { source: "dashboard", mode: "inline" },
  });

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${parsed.data.taskId}`);
  return { value: nextValue };
}
