"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export async function deleteSubscriptionAction(id: string): Promise<{ error?: string }> {
  const { dict } = await getDictionary();
  const user = await requireUser();

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("deleteSubscription error:", error);
      return { error: dict.subscriptions.errors.deleteFailed };
    }
  } catch (err) {
    console.error("deleteSubscription unexpected error:", err);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return {};
}
