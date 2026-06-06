"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTransactionSchemas } from "../schemas/transaction.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateTransactionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { updateTransactionSchema } = getTransactionSchemas(dict.money.errors);

  const user = await requireUser();

  const rawData = {
    transactionId: formData.get("transactionId") as string,
    title: formData.get("title") as string,
    type: formData.get("type") as string,
    amount: formData.get("amount") as string,
    account_id: formData.get("account_id") as string,
    category_id: (formData.get("category_id") as string) || null,
    transaction_date: (formData.get("transaction_date") as string) || undefined,
    note: (formData.get("note") as string) || null,
  };

  const parsed = updateTransactionSchema.safeParse(rawData);

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
      .from("money_transactions")
      .update({
        title: parsed.data.title,
        type: parsed.data.type,
        amount: parsed.data.amount,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        transaction_date: parsed.data.transaction_date,
        note: parsed.data.note,
      })
      .eq("id", parsed.data.transactionId)
      .eq("user_id", user.id);

    if (error) {
      console.error("updateTransaction error:", error);
      return { error: dict.money.errors.updateTransactionFailed };
    }
  } catch (err) {
    console.error("updateTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
