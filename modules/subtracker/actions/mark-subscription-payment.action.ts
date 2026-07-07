"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { markSubscriptionPaymentSchema } from "../schemas/payment-cycle.schema";
import { markSubscriptionPaymentAsPaid } from "../services/mark-subscription-payment-as-paid";

/**
 * Server Action: record a subscription payment ("Mark as paid").
 *
 * Specialized flow — NOT generic task completion. Creates the expense
 * transaction idempotently, completes the task, advances the subscription and
 * opens the next cycle. Duplicate clicks never create duplicate expenses.
 */
export async function markSubscriptionPaymentAction(input: {
  cycleId: string;
  accountId: string;
  paidDate?: string;
}): Promise<{ error?: string; transactionId?: string | null; alreadyPaid?: boolean }> {
  const parsed = markSubscriptionPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Recording a payment can post a real money transaction — a write blocked
  // once the org is not writable.
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { error: err.message };
    throw err;
  }
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to record subscription payments." };
  }

  const supabase = await createClient();
  const result = await markSubscriptionPaymentAsPaid({
    supabase,
    ctx,
    cycleId: parsed.data.cycleId,
    accountId: parsed.data.accountId,
    paidDate: parsed.data.paidDate,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return { transactionId: result.transactionId, alreadyPaid: result.alreadyPaid };
}
