"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { changeSubscriptionPaymentDueDateSchema } from "../schemas/payment-cycle.schema";
import { changeSubscriptionPaymentDueDate } from "../services/change-subscription-payment-due-date";

/** Server Action: change an open cycle's due date (audited). */
export async function changeSubscriptionPaymentDueDateAction(input: {
  cycleId: string;
  newDueDate: string;
}): Promise<{ error?: string }> {
  const parsed = changeSubscriptionPaymentDueDateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to change subscription due dates." };
  }

  const supabase = await createClient();
  const result = await changeSubscriptionPaymentDueDate({
    supabase,
    ctx,
    cycleId: parsed.data.cycleId,
    newDueDate: parsed.data.newDueDate,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.dashboard);
  return {};
}
