"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { skipFinancialTaskSchema, dismissFinancialTaskSchema } from "../schemas/financial-task.schema";
import { resolveFinancialTask } from "../services/resolve-financial-task";

/**
 * Server Action: skip a financial task (obligation handled outside Business OS).
 * No money moves — the task is closed with financial_status 'skipped'.
 */
export async function skipFinancialTaskAction(input: {
  taskId: string;
  reason?: string | null;
}): Promise<{ error?: string; ok?: boolean }> {
  const parsed = skipFinancialTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "todos.write")) return { error: "You do not have permission to update tasks." };

  const supabase = await createClient();
  const result = await resolveFinancialTask({
    supabase,
    ctx,
    taskId: parsed.data.taskId,
    resolution: "skipped",
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${parsed.data.taskId}`);
  return { ok: true };
}

/**
 * Server Action: dismiss a false-positive financial obligation.
 * No money moves — the task is closed with financial_status 'dismissed'.
 */
export async function dismissFinancialTaskAction(input: {
  taskId: string;
  reason?: string | null;
}): Promise<{ error?: string; ok?: boolean }> {
  const parsed = dismissFinancialTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "todos.write")) return { error: "You do not have permission to update tasks." };

  const supabase = await createClient();
  const result = await resolveFinancialTask({
    supabase,
    ctx,
    taskId: parsed.data.taskId,
    resolution: "dismissed",
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${parsed.data.taskId}`);
  return { ok: true };
}
