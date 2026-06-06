"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTransactionSchemas } from "../schemas/transaction.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать транзакцию.
 *
 * Безопасность: RLS policy с EXISTS проверит,
 * что account_id и category_id принадлежат текущему пользователю.
 * Даже если кто-то подменит account_id в FormData — БД отклонит.
 */
export async function createTransactionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createTransactionSchema } = getTransactionSchemas(dict.money.errors);

  const user = await requireUser();

  const rawData = {
    title: formData.get("title") as string,
    type: formData.get("type") as string,
    amount: formData.get("amount") as string,
    account_id: formData.get("account_id") as string,
    category_id: (formData.get("category_id") as string) || null,
    transaction_date: (formData.get("transaction_date") as string) || undefined,
    note: (formData.get("note") as string) || null,
  };

  const parsed = createTransactionSchema.safeParse(rawData);

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

    const { error } = await supabase.from("money_transactions").insert({
      user_id: user.id,
      title: parsed.data.title,
      type: parsed.data.type,
      amount: parsed.data.amount,
      account_id: parsed.data.account_id,
      category_id: parsed.data.category_id,
      transaction_date: parsed.data.transaction_date,
      currency: parsed.data.currency,
      note: parsed.data.note,
    });

    if (error) {
      console.error("createTransaction error:", error);
      return { error: dict.money.errors.createTransactionFailed };
    }
  } catch (err) {
    console.error("createTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
