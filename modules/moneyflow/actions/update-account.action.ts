"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
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
  });

  const user = await requireUser();

  const parsed = updateAccountSchema.safeParse({
    accountId: formData.get("accountId") as string,
    name: formData.get("name") as string,
    type: formData.get("type") as string,
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

    const { error } = await supabase
      .from("money_accounts")
      .update({ name: parsed.data.name, type: parsed.data.type })
      .eq("id", parsed.data.accountId)
      .eq("user_id", user.id);

    if (error) {
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
