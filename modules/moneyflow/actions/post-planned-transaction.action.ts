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
 * Безопасность:
 *   - org берётся из серверного контекста, не с клиента;
 *   - permission data.write (canDo);
 *   - .eq(organization_id) + .eq(status='planned') + RLS → провести можно
 *     только СВОЮ ещё не проведённую транзакцию (идемпотентно: повторный
 *     вызов не найдёт planned-строку).
 */
export async function postPlannedTransactionAction(
  id: string,
): Promise<{ error?: string }> {
  const { dict } = await getDictionary();

  if (!uuidSchema.safeParse(id).success) {
    return { error: dict.money.errors.serverError };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: dict.money.errors.serverError };
  }

  try {
    const supabase = await createClient();

    const { data: posted, error } = await supabase
      .from("money_transactions")
      .update({ status: "posted", updated_by: ctx.user.id })
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .eq("status", "planned")
      .select("id, account_id, amount, type, currency, transaction_date")
      .maybeSingle();

    if (error) {
      console.error("postPlannedTransaction error:", error);
      return { error: dict.money.errors.updateTransactionFailed };
    }

    if (!posted) {
      // Нет такой planned-транзакции в этой org (или уже проведена).
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
  } catch (err) {
    console.error("postPlannedTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
