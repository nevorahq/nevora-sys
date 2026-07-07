"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { getAccountSchemas } from "../schemas/account.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateAccountAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { updateAccountSchema } = getAccountSchemas({
    nameRequired: dict.money.errors.titleRequired,
    invalidType: dict.money.errors.invalidType,
    balanceNegative: dict.money.errors.balanceNegative,
  });

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  if (!canDo(ctx, "data.write")) {
    return { error: dict.money.errors.updateAccountFailed };
  }

  const parsed = updateAccountSchema.safeParse({
    accountId: formData.get("accountId") as string,
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    initial_balance: formData.get("initial_balance") as string,
  });

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

    const { data: updatedAccount, error } = await supabase
      .from("money_accounts")
      .update({
        name: parsed.data.name,
        type: parsed.data.type,
        initial_balance: parsed.data.initial_balance,
        updated_by: ctx.user.id,
      })
      .eq("id", parsed.data.accountId)
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error || !updatedAccount) {
      console.error("updateAccount error:", error);
      return { error: dict.money.errors.updateAccountFailed };
    }
  } catch (err) {
    console.error("updateAccount unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
