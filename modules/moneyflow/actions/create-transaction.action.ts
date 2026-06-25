"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { checkPlanLimit } from "@/lib/billing";
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

  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "money_transactions");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Money transaction limit reached. Upgrade your plan." };
  }

  const rawData = {
    title: formData.get("title") as string,
    type: formData.get("type") as string,
    amount: formData.get("amount") as string,
    account_id: formData.get("account_id") as string,
    category_id: (formData.get("category_id") as string) || null,
    subscription_id: (formData.get("subscription_id") as string) || null,
    status: (formData.get("status") as string) || undefined,
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

    const { data: newTx, error } = await supabase
      .from("money_transactions")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        created_by: user.id,
        updated_by: user.id,
        title: parsed.data.title,
        type: parsed.data.type,
        amount: parsed.data.amount,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        transaction_date: parsed.data.transaction_date,
        currency: parsed.data.currency,
        status: parsed.data.status,
        note: parsed.data.note,
      })
      .select("id")
      .single();

    if (error || !newTx) {
      console.error("createTransaction error:", error);
      return { error: dict.money.errors.createTransactionFailed };
    }

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName: "money.transaction.created",
      aggregateType: "transaction",
      aggregateId: newTx.id,
      payload: {
        amount: parsed.data.amount,
        type: parsed.data.type,
        currency: parsed.data.currency,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        transaction_date: parsed.data.transaction_date ?? null,
        status: parsed.data.status,
        // Если задано — on-transaction-created создаст entity_link paid_by.
        ...(parsed.data.subscription_id
          ? { subscription_id: parsed.data.subscription_id }
          : {}),
      },
    });
  } catch (err) {
    console.error("createTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
