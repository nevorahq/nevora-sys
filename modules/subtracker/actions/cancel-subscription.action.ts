"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { cancelSubscriptionSchema } from "../schemas/payment-cycle.schema";
import { cancelSubscriptionRenewal } from "../services/cancel-subscription-renewal";

/** Server Action: cancel a subscription's renewal — stops all future work. */
export async function cancelSubscriptionAction(input: {
  subscriptionId: string;
}): Promise<{ error?: string }> {
  const parsed = cancelSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to cancel subscriptions." };
  }

  const supabase = await createClient();
  const result = await cancelSubscriptionRenewal({
    supabase,
    ctx,
    subscriptionId: parsed.data.subscriptionId,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.dashboard);
  return {};
}
