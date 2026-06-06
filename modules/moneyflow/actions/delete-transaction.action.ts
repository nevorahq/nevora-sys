"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export async function deleteTransactionAction(id: string): Promise<{ error?: string }> {
  const { dict } = await getDictionary();
  const user = await requireUser();

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("money_transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("deleteTransaction error:", error);
      return { error: dict.money.errors.deleteTransactionFailed };
    }
  } catch (err) {
    console.error("deleteTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
