"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { getAccountSchemas } from "../schemas/account.schema";
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
  });

  const { user, org, workspace } = await requireOrg();

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
      organization_id: org.id,
      workspace_id: workspace.id,
      created_by: user.id,
      updated_by: user.id,
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
