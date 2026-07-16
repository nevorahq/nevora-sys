"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { getTransferSchema } from "../schemas/transfer.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

type CreatedTransferSnapshot = {
  id: string;
  source_amount: string | number;
  source_currency: string;
  destination_amount: string | number;
  destination_currency: string;
  reference_exchange_rate: string | number | null;
  effective_exchange_rate: string | number;
  exchange_rate_source: string | null;
  exchange_rate_id: string | null;
};

/**
 * Server Action: перевод средств между двумя счетами (Internal Transfer).
 *
 * Модель: ОДНА строка money_transactions с type='transfer', from_account_id и
 * to_account_id. Баланс вычисляемый (нет колонки balance), поэтому перевод —
 * это один INSERT и он атомарен по своей природе: частичного состояния
 * (списали, но не зачислили) возникнуть не может.
 *
 * Перевод нейтрален для income/expense-аналитики. В валютных bucket-остатках
 * source amount вычитается, а immutable destination amount прибавляется.
 *
 * Безопасность: RLS WITH CHECK can_write_data(organization_id) защищает запись.
 * RPC и DB-trigger повторно проверяют оба счёта, валюты и snapshot-поля.
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
  const { org, workspace } = ctx;

  const parsed = transferSchema.safeParse({
    from_account_id: formData.get("from_account_id") as string,
    to_account_id: formData.get("to_account_id") as string,
    amount: formData.get("amount") as string,
    destination_amount: (formData.get("destination_amount") as string) || "",
    use_custom_destination: formData.get("use_custom_destination") === "yes" ? "yes" : "no",
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

    try {
      await reserveOrganizationUsage(org.id, "money_transactions.count", 1);
      reserved = true;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Money transaction limit reached. Upgrade your plan." };
    }

    // PostgreSQL re-fetches both accounts, resolves the reference FX rate and
    // rounds NUMERIC values. Client-provided currencies/rates are never trusted.
    const { data: newTx, error } = await supabase
      .rpc("create_money_transfer", {
        p_organization_id: org.id,
        p_workspace_id: workspace.id,
        p_from_account_id: parsed.data.from_account_id,
        p_to_account_id: parsed.data.to_account_id,
        p_source_amount: parsed.data.amount,
        p_destination_amount: parsed.data.use_custom_destination === "yes"
          ? parsed.data.destination_amount
          : null,
        p_transaction_date: parsed.data.transaction_date,
        p_note: parsed.data.note,
      })
      .single();

    if (error || !newTx) {
      console.error("createTransfer error:", JSON.stringify({
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      }));
      await releaseOrganizationUsage(org.id, "money_transactions.count", 1);
      if (error?.message?.includes("missing_exchange_rate")) {
        return { fieldErrors: { destination_amount: [dict.money.errors.transferRateMissing] } };
      }
      if (error?.message?.includes("transfer_account")) {
        return { error: dict.money.errors.accountRequired };
      }
      return { error: dict.money.errors.createTransferFailed };
    }
    reserved = false;
    const snapshot = newTx as CreatedTransferSnapshot;

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName: "money.transfer.created",
      aggregateType: "transaction",
      aggregateId: snapshot.id,
      payload: {
        // Legacy fields retained for existing consumers.
        amount: Number(snapshot.source_amount),
        currency: snapshot.source_currency,
        source_amount: Number(snapshot.source_amount),
        source_currency: snapshot.source_currency,
        destination_amount: Number(snapshot.destination_amount),
        destination_currency: snapshot.destination_currency,
        reference_exchange_rate: snapshot.reference_exchange_rate == null
          ? null
          : Number(snapshot.reference_exchange_rate),
        effective_exchange_rate: Number(snapshot.effective_exchange_rate),
        exchange_rate_source: snapshot.exchange_rate_source,
        exchange_rate_id: snapshot.exchange_rate_id,
        from_account_id: parsed.data.from_account_id,
        to_account_id: parsed.data.to_account_id,
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
