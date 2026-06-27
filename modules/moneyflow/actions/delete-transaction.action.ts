"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
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

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.delete")) {
    return { error: dict.money.errors.deleteTransactionFailed };
  }

  try {
    const supabase = await createClient();

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
  return {};
}
