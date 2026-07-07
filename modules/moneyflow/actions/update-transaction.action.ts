"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
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

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }

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

    // Money Intelligence: a category picked in the edit form is a manual,
    // confirmed decision; removing it returns the row to 'uncategorized'.
    const { data: previous } = await supabase
      .from("money_transactions")
      .select("category_id")
      .eq("id", parsed.data.transactionId)
      .eq("organization_id", ctx.org.id)
      .maybeSingle();

    const { data: updatedTx, error } = await supabase
      .from("money_transactions")
      .update({
        title: parsed.data.title,
        type: parsed.data.type,
        amount: parsed.data.amount,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        category_source: parsed.data.category_id ? "manual" : null,
        category_confidence: null,
        categorization_status: parsed.data.category_id ? "confirmed" : "uncategorized",
        transaction_date: parsed.data.transaction_date,
        note: parsed.data.note,
        updated_by: ctx.user.id,
      })
      .eq("id", parsed.data.transactionId)
      .eq("organization_id", ctx.org.id)
      .select("id, organization_id, workspace_id")
      .single();

    if (error || !updatedTx) {
      console.error("updateTransaction error:", error);
      return { error: dict.money.errors.updateTransactionFailed };
    }

    if ((previous?.category_id ?? null) !== parsed.data.category_id) {
      await emitDomainEvent({
        organizationId: ctx.org.id,
        workspaceId: (updatedTx.workspace_id as string | null) ?? undefined,
        eventName: "money.transaction.category_changed",
        aggregateType: "transaction",
        aggregateId: updatedTx.id as string,
        payload: {
          transaction_id: updatedTx.id,
          category_id: parsed.data.category_id,
          category_source: parsed.data.category_id ? "manual" : null,
        },
      });
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: (updatedTx.workspace_id as string | null) ?? undefined,
      eventName: "money.transaction.updated",
      aggregateType: "transaction",
      aggregateId: updatedTx.id as string,
      payload: {
        amount: parsed.data.amount,
        type: parsed.data.type,
        account_id: parsed.data.account_id,
        transaction_date: parsed.data.transaction_date ?? null,
      },
    });
  } catch (err) {
    console.error("updateTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
