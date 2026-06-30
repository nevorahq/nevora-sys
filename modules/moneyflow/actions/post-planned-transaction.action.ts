"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

/**
 * Server Action: «провести» запланированную транзакцию (planned → posted).
 *
 * После проведения транзакция становится фактической и начинает влиять
 * на Balance / Monthly Expenses; из прогноза «Предстоящие расходы» уходит.
 *
 * Currency invariant: a planned draft can only post onto a SAME-currency
 * account. Document drafts are auto-assigned to a default account that may
 * differ in currency, so the caller may pass a compatible `accountId` to
 * reassign-and-post (mirrors confirmDocumentTransactionAction). A mismatch with
 * no replacement is blocked.
 *
 * Безопасность:
 *   - org берётся из серверного контекста, не с клиента;
 *   - permission data.write (canDo);
 *   - .eq(organization_id) + .eq(status='planned') + RLS → провести можно
 *     только СВОЮ ещё не проведённую транзакцию (идемпотентно: повторный
 *     вызов не найдёт planned-строку); счёт тоже проверяется на принадлежность org.
 */
export async function postPlannedTransactionAction(
  id: string,
  accountId?: string,
): Promise<{ error?: string }> {
  const { dict } = await getDictionary();

  if (!uuidSchema.safeParse(id).success) {
    return { error: dict.money.errors.serverError };
  }
  if (accountId !== undefined && !uuidSchema.safeParse(accountId).success) {
    return { error: dict.money.errors.serverError };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: dict.money.errors.serverError };
  }

  try {
    const supabase = await createClient();

    // Load the planned draft to enforce the currency invariant before posting.
    const { data: draft, error: draftError } = await supabase
      .from("money_transactions")
      .select("id, account_id, currency")
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .eq("status", "planned")
      .is("deleted_at", null)
      .maybeSingle();

    if (draftError) {
      console.error("postPlannedTransaction load error:", draftError);
      return { error: dict.money.errors.updateTransactionFailed };
    }
    if (!draft) {
      // Нет такой planned-транзакции в этой org (или уже проведена/отклонена).
      return { error: dict.money.errors.updateTransactionFailed };
    }

    // Currency invariant: never post a foreign-currency amount onto an account.
    // The caller may reassign to a compatible account (`accountId`); otherwise the
    // draft's current account is used.
    const targetAccountId = accountId ?? (draft.account_id as string | null);
    if (!targetAccountId) {
      return { error: dict.money.errors.currencyMismatch };
    }

    const { data: account, error: accountError } = await supabase
      .from("money_accounts")
      .select("currency")
      .eq("id", targetAccountId)
      .eq("organization_id", ctx.org.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (accountError) {
      console.error("postPlannedTransaction account error:", accountError);
      return { error: dict.money.errors.updateTransactionFailed };
    }
    if (!account || (account.currency as string) !== (draft.currency as string)) {
      return { error: dict.money.errors.currencyMismatch };
    }

    const { data: posted, error } = await supabase
      .from("money_transactions")
      .update({ status: "posted", account_id: targetAccountId, updated_by: ctx.user.id })
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .eq("status", "planned")
      .is("deleted_at", null)
      .select("id, account_id, amount, type, currency, transaction_date")
      .maybeSingle();

    if (error) {
      console.error("postPlannedTransaction error:", error);
      return { error: dict.money.errors.updateTransactionFailed };
    }

    if (!posted) {
      return { error: dict.money.errors.updateTransactionFailed };
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.transaction.updated",
      aggregateType: "transaction",
      aggregateId: posted.id as string,
      payload: {
        amount: Number(posted.amount),
        type: posted.type as string,
        account_id: (posted.account_id as string | null) ?? null,
        transaction_date: (posted.transaction_date as string | null) ?? null,
      },
    });

    // Resolve any Action Center review item(s) for this transaction (e.g. a
    // document "Confirm expense" draft posted from the money page instead).
    await supabase
      .from("action_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("organization_id", ctx.org.id)
      .eq("source_type", "transaction")
      .eq("source_id", id)
      .in("status", ["open", "in_progress", "snoozed"]);
  } catch (err) {
    console.error("postPlannedTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
