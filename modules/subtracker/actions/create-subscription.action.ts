"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getSubscriptionSchemas } from "../schemas/subscription.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createSubscriptionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createSubscriptionSchema } = getSubscriptionSchemas(dict.subscriptions.errors);

  const user = await requireUser();

  const rawData = {
    name: formData.get("name") as string,
    amount: formData.get("amount") as string,
    billing_cycle: formData.get("billing_cycle") as string,
    next_billing_date: formData.get("next_billing_date") as string,
    category: formData.get("category") as string,
    url: (formData.get("url") as string) || null,
    note: (formData.get("note") as string) || null,
  };

  const parsed = createSubscriptionSchema.safeParse(rawData);

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

    const { error } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      name: parsed.data.name,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      billing_cycle: parsed.data.billing_cycle,
      next_billing_date: parsed.data.next_billing_date,
      category: parsed.data.category,
      url: parsed.data.url,
      note: parsed.data.note,
    });

    if (error) {
      console.error("createSubscription error:", error);
      return { error: dict.subscriptions.errors.createFailed };
    }
  } catch (err) {
    console.error("createSubscription unexpected error:", err);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return {};
}
