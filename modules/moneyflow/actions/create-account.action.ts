"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getAccountSchemas } from "../schemas/account.schema";
import { createMoneyAccount } from "../services/money-account-service";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать счёт.
 *
 * Паттерн:
 * 1. requireOrg() — authenticated organization and workspace context
 * 2. Zod validation с i18n
 * 3. Supabase INSERT (RLS проверит organization_id)
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
    balanceNegative: dict.money.errors.balanceNegative,
  });

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: dict.money.errors.createAccountFailed };
  }

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

    const result = await createMoneyAccount(supabase, ctx, {
      name: parsed.data.name,
      type: parsed.data.type,
      initialBalance: parsed.data.initial_balance,
      currency: parsed.data.currency,
    });

    if (!result.ok) {
      console.error("createAccount error:", result.error);
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
