"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { markFinancialTaskPaidSchema } from "../schemas/financial-task.schema";
import { markFinancialTaskAsPaid } from "../services/mark-financial-task-paid";

/**
 * Server Action: "Mark as paid" for a one-off financial task.
 *
 * Posts exactly one expense transaction (idempotent — a duplicate click returns
 * the existing transaction and creates nothing new), completes the task and
 * links task ↔ transaction ↔ document. Subscription payment tasks use the
 * subscription workflow instead.
 */
export async function markFinancialTaskPaidAction(input: {
  taskId: string;
  accountId: string;
  categoryId?: string | null;
  paidDate?: string | null;
}): Promise<{ error?: string; transactionId?: string | null; alreadyPaid?: boolean }> {
  const parsed = markFinancialTaskPaidSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to record payments." };
  }

  const supabase = await createClient();
  const result = await markFinancialTaskAsPaid({
    supabase,
    ctx,
    taskId: parsed.data.taskId,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId,
    paidDate: parsed.data.paidDate,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.tasks);
  revalidatePath(`${ROUTES.tasks}/${parsed.data.taskId}`);
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return { transactionId: result.transactionId, alreadyPaid: result.alreadyPaid };
}
