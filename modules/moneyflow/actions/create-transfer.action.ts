"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { getTransferSchema } from "../schemas/transfer.schema";
import { TRANSFER_TYPE } from "../constants/moneyflow.constants";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: перевод средств между двумя счетами (Internal Transfer).
 *
 * Модель: ОДНА строка money_transactions с type='transfer', from_account_id и
 * to_account_id. Баланс вычисляемый (нет колонки balance), поэтому перевод —
 * это один INSERT и он атомарен по своей природе: частичного состояния
 * (списали, но не зачислили) возникнуть не может.
 *
 * Перевод нейтрален для аналитики: get-money-summary и get-expense-breakdown
 * фильтруют type IN ('income','expense'), так что transfer не попадает ни в
 * доходы, ни в расходы, ни в разбивку по категориям. На уровне валюты перевод
 * нетто-ноль (минус у источника, плюс у получателя), общий баланс не меняется.
 *
 * Безопасность: RLS WITH CHECK can_write_data(organization_id) защищает запись.
 * Дополнительно проверяем, что ОБА счёта принадлежат организации, активны и
 * имеют одинаковую валюту (RLS не валидирует to_account_id).
 */
export async function createTransferAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const e = dict.money.errors;
  const transferSchema = getTransferSchema({
    fromAccountRequired: e.fromAccountRequired,
    toAccountRequired: e.toAccountRequired,
    sameAccount: e.sameAccount,
    amountRequired: e.amountRequired,
    amountPositive: e.amountPositive,
    invalidDate: e.invalidDate,
  });

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace } = ctx;

  const parsed = transferSchema.safeParse({
    from_account_id: formData.get("from_account_id") as string,
    to_account_id: formData.get("to_account_id") as string,
    amount: formData.get("amount") as string,
    transaction_date: (formData.get("transaction_date") as string) || undefined,
    note: (formData.get("note") as string) || null,
  });

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
    const supabase = await createClient();

    // Подтверждаем, что оба счёта существуют, активны и принадлежат организации.
    // Берём имена для заголовка ленты и валюту источника как валюту перевода.
    const { data: accounts, error: accountsError } = await supabase
      .from("money_accounts")
      .select("id, name, currency, is_active")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .in("id", [parsed.data.from_account_id, parsed.data.to_account_id]);

    if (accountsError) {
      console.error("createTransfer accounts lookup error:", accountsError);
      return { error: dict.money.errors.serverError };
    }

    const from = accounts?.find((a) => a.id === parsed.data.from_account_id);
    const to = accounts?.find((a) => a.id === parsed.data.to_account_id);

    if (!from || !from.is_active) {
      return { fieldErrors: { from_account_id: [dict.money.errors.accountRequired] } };
    }
    if (!to || !to.is_active) {
      return { fieldErrors: { to_account_id: [dict.money.errors.accountRequired] } };
    }

    // MVP: переводы только между счетами с одинаковой валютой (без конвертации).
    if (from.currency !== to.currency) {
      return { fieldErrors: { to_account_id: [dict.money.errors.transferCurrencyMismatch] } };
    }

    try {
      await reserveOrganizationUsage(org.id, "money_transactions.count", 1);
      reserved = true;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Money transaction limit reached. Upgrade your plan." };
    }

    const { data: newTx, error } = await supabase
      .from("money_transactions")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        created_by: user.id,
        updated_by: user.id,
        // account_id зеркалит источник: сохраняет совместимость с запросами,
        // которые джойнят account:money_accounts(name) и фильтруют по account_id.
        account_id: from.id,
        from_account_id: from.id,
        to_account_id: to.id,
        category_id: null,
        type: TRANSFER_TYPE,
        amount: parsed.data.amount,
        currency: from.currency,
        transaction_date: parsed.data.transaction_date,
        title: `${from.name} → ${to.name}`,
        note: parsed.data.note,
        status: "posted",
      })
      .select("id")
      .single();

    if (error || !newTx) {
      console.error("createTransfer error:", error);
      await releaseOrganizationUsage(org.id, "money_transactions.count", 1);
      return { error: dict.money.errors.createTransferFailed };
    }
    reserved = false;

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName: "money.transfer.created",
      aggregateType: "transaction",
      aggregateId: newTx.id,
      payload: {
        amount: parsed.data.amount,
        currency: from.currency,
        from_account_id: from.id,
        to_account_id: to.id,
        transaction_date: parsed.data.transaction_date,
      },
    });
  } catch (err) {
    console.error("createTransfer unexpected error:", err);
    if (reserved) await releaseOrganizationUsage(org.id, "money_transactions.count", 1);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
