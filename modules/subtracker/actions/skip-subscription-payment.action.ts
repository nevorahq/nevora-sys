"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { skipSubscriptionPaymentSchema } from "../schemas/payment-cycle.schema";
import { skipSubscriptionPaymentCycle } from "../services/skip-subscription-payment-cycle";

/** Server Action: skip the current billing period (no money transaction). */
export async function skipSubscriptionPaymentAction(input: {
  cycleId: string;
}): Promise<{ error?: string }> {
  const parsed = skipSubscriptionPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to skip subscription payments." };
  }

  const supabase = await createClient();
  const result = await skipSubscriptionPaymentCycle({ supabase, ctx, cycleId: parsed.data.cycleId });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.dashboard);
  return {};
}
