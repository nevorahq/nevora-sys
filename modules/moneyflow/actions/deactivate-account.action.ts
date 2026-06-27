"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { uuidSchema } from "@/lib/validators/common";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export async function deactivateAccountAction(id: string): Promise<{ error?: string }> {
  const { dict } = await getDictionary();
  if (!uuidSchema.safeParse(id).success) {
    return { error: dict.money.errors.deactivateAccountFailed };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: dict.money.errors.deactivateAccountFailed };
  }

  try {
    const supabase = await createClient();

    const { data: deactivatedAccount, error } = await supabase
      .from("money_accounts")
      .update({ is_active: false, updated_by: ctx.user.id })
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error || !deactivatedAccount) {
      console.error("deactivateAccount error:", error);
      return { error: dict.money.errors.deactivateAccountFailed };
    }
  } catch (err) {
    console.error("deactivateAccount unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
