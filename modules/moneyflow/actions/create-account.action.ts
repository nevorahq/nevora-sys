"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAccountSchemas } from "../schemas/account.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать счёт.
 *
 * Паттерн:
 * 1. requireUser() — defense in depth
 * 2. Zod validation с i18n
 * 3. Supabase INSERT (RLS проверит user_id)
 * 4. revalidatePath — обновить UI
 */
export async function createAccountAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createAccountSchema } = getAccountSchemas({
    nameRequired: dict.money.errors.titleRequired,
    invalidType: dict.money.errors.invalidType,
  });

  const user = await requireUser();

  const rawData = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    initial_balance: formData.get("initial_balance") as string,
    currency: formData.get("currency") as string || undefined,
  };

  const parsed = createAccountSchema.safeParse(rawData);

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

    const { error } = await supabase.from("money_accounts").insert({
      user_id: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      initial_balance: parsed.data.initial_balance,
      currency: parsed.data.currency,
    });

    if (error) {
      console.error("createAccount error:", error);
      return { error: dict.money.errors.createAccountFailed };
    }
  } catch (err) {
    console.error("createAccount unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
