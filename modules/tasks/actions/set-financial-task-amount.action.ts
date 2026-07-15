"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { setFinancialTaskAmountSchema } from "../schemas/financial-task.schema";
import { setFinancialTaskAmount } from "../services/set-financial-task-amount";

/**
 * Server Action: set the amount/currency of an open financial task whose
 * obligation was captured without a number.
 *
 * Money-safe — this only records the planned obligation amount; nothing is posted
 * to Money. The expense is still created solely by Mark-as-paid.
 */
export async function setFinancialTaskAmountAction(input: {
  taskId: string;
  amount: number;
  currency: string;
}): Promise<{ error?: string }> {
  const parsed = setFinancialTaskAmountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to edit this task." };
  }

  const supabase = await createClient();
  const result = await setFinancialTaskAmount({
    supabase,
    ctx,
    taskId: parsed.data.taskId,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`${ROUTES.tasks}/${parsed.data.taskId}`);
  revalidatePath(ROUTES.tasks);
  return {};
}
