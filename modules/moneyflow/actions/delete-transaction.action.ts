"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export async function deleteTransactionAction(id: string): Promise<{ error?: string }> {
  const { dict } = await getDictionary();
  if (!uuidSchema.safeParse(id).success) {
    return { error: dict.money.errors.deleteTransactionFailed };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    // Deletes are manager+ (data.delete, mirrors can_delete_data) and blocked
    // once the org is no longer writable (expired trial / unpaid).
    ctx = await requireAppAccess({ permission: "data.delete", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  // Defense in depth: keep the localized guard message for the permission case.
  if (!canDo(ctx, "data.delete")) {
    return { error: dict.money.errors.deleteTransactionFailed };
  }

  try {
    const supabase = await createClient();

    // Guard: never let a delete silently un-back a confirmed payment. The FK on
    // both subscription_payment_cycles.transaction_id and
    // todos.financial_transaction_id is ON DELETE SET NULL, so a raw delete would
    // null the link while the obligation stays `paid` — a phantom-paid row (this
    // is the origin of the one legacy cycle found on remote 2026-07-08). Refuse
    // and point the user at the obligation instead of corrupting its state.
    const { data: linkedCycle } = await supabase
      .from("subscription_payment_cycles")
      .select("id")
      .eq("transaction_id", id)
      .eq("status", "paid")
      .eq("organization_id", ctx.org.id)
      .limit(1)
      .maybeSingle();

    const { data: linkedTask } = linkedCycle
      ? { data: null }
      : await supabase
          .from("todos")
          .select("id")
          .eq("financial_transaction_id", id)
          .eq("financial_status", "paid")
          .eq("organization_id", ctx.org.id)
          .limit(1)
          .maybeSingle();

    if (linkedCycle || linkedTask) {
      return { error: dict.money.errors.transactionLinkedToPaidObligation };
    }

    const { data: deletedTransaction, error } = await supabase
      .from("money_transactions")
      .delete()
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .select("id, workspace_id, amount, type")
      .maybeSingle();

    if (error || !deletedTransaction) {
      console.error("deleteTransaction error:", error);
      return { error: dict.money.errors.deleteTransactionFailed };
    }

    // Clean up the Action Center + notification footprint of the deleted
    // transaction so no dropdown item is left pointing at a now-404 page.
    // Best-effort: never fail the delete over cleanup.
    const { error: purgeError } = await supabase.rpc("purge_transaction_from_action_center", {
      p_organization_id: ctx.org.id,
      p_transaction_id: deletedTransaction.id as string,
    });
    if (purgeError) {
      console.error("[deleteTransaction] purge failed:", purgeError.message);
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: (deletedTransaction.workspace_id as string | null) ?? undefined,
      eventName: "transaction.deleted",
      aggregateType: "transaction",
      aggregateId: deletedTransaction.id as string,
      payload: {
        amount: Number(deletedTransaction.amount),
        type: deletedTransaction.type as string,
      },
    });
  } catch (err) {
    console.error("deleteTransaction unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.actions);
  return {};
}
