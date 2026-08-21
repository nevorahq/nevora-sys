"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { markSubscriptionPaymentSchema } from "../schemas/payment-cycle.schema";
import { markSubscriptionPaymentAsPaid } from "../services/mark-subscription-payment-as-paid";

/**
 * Server Action: mark the current billing period as paid, locally in
 * Subscriptions. Does not touch Money — see the service for why.
 */
export async function markSubscriptionPaymentAction(input: {
  cycleId: string;
}): Promise<{ error?: string }> {
  const parsed = markSubscriptionPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to mark subscription payments." };
  }

  const supabase = await createClient();
  const result = await markSubscriptionPaymentAsPaid({
    supabase,
    ctx,
    cycleId: parsed.data.cycleId,
    paidDate: parsed.data.paidDate,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.dashboard);
  return {};
}
