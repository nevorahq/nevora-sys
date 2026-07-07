"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { getTransactionSchemas } from "../schemas/transaction.schema";
import { categorizeTransaction } from "../services/money-categorization.service";
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

  // Centralized gate: auth → tenant → membership → data.write → billing
  // entitlement (write blocked once the trial/subscription is not writable).
  // Per-metric quota stays with the atomic reserveOrganizationUsage below —
  // the guard intentionally omits `capability` so we don't double-count.
  let ctx;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace } = ctx;

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

  // Live reservation not yet backed by a row; released in the outer catch if we
  // never reach a committed insert (P1-3).
  let reserved = false;
  try {
    await reserveOrganizationUsage(org.id, "money_transactions.count", 1);
    reserved = true;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Money transaction limit reached. Upgrade your plan." };
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
        // A category picked in the form is a manual, confirmed decision
        // (Money Intelligence, migration 069). Without one the row waits in
        // the uncategorized queue for rule/AI categorization.
        category_source: parsed.data.category_id ? "manual" : null,
        categorization_status: parsed.data.category_id ? "confirmed" : "uncategorized",
        transaction_date: parsed.data.transaction_date,
        currency: parsed.data.currency,
        status: parsed.data.status,
        note: parsed.data.note,
      })
      .select("id")
      .single();

    if (error || !newTx) {
      console.error("createTransaction error:", error);
      await releaseOrganizationUsage(org.id, "money_transactions.count", 1);
      return { error: dict.money.errors.createTransactionFailed };
    }
    reserved = false;

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

    // Auto-categorization (Phase 5.1): a posted income/expense without a
    // user-picked category enters the pipeline automatically. The heavy work
    // (incl. a possible AI call) runs AFTER the response via Next `after()` —
    // same non-blocking pattern as document extraction. A user rule applies
    // the category directly; history/system/AI only create a pending
    // suggestion; failures mark the row 'failed' and never surface here.
    // Limitation: no background worker exists, so if the `after()` callback is
    // lost (process crash) the row simply stays in the uncategorized queue,
    // where manual/bulk categorization picks it up.
    if (
      !parsed.data.category_id &&
      parsed.data.status !== "planned" &&
      (parsed.data.type === "income" || parsed.data.type === "expense")
    ) {
      const transactionId = newTx.id as string;
      await emitDomainEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        eventName: "money.transaction.auto_categorization_requested",
        aggregateType: "transaction",
        aggregateId: transactionId,
        payload: { transaction_id: transactionId, type: parsed.data.type },
      });
      after(async () => {
        try {
          const bgSupabase = await createClient();
          const bgCtx = await requireOrg();
          await categorizeTransaction(bgSupabase, bgCtx, transactionId, { allowAi: true });
        } catch (err) {
          console.error("createTransaction: auto-categorization failed", err);
        }
      });
    }
  } catch (err) {
    console.error("createTransaction unexpected error:", err);
    if (reserved) await releaseOrganizationUsage(org.id, "money_transactions.count", 1);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
