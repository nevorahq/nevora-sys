"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";

/**
 * Reject a draft (planned) transaction created from a document.
 *
 * "Reject" == soft-delete (deleted_at) the planned draft. The source document
 * and its extraction stay intact, so the user can retry later. We never touch a
 * 'posted' (confirmed) transaction here.
 */
export async function rejectDocumentTransactionAction(
  transactionId: string,
): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(transactionId).success) {
    return { error: "Invalid transaction ID." };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to reject transactions." };
  }

  const supabase = await createClient();

  const { data: rejected, error } = await supabase
    .from("money_transactions")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "planned")
    .not("source_document_id", "is", null)
    .is("deleted_at", null)
    .select("id, source_document_id")
    .maybeSingle();

  if (error) {
    console.error("rejectDocumentTransaction error:", error);
    return { error: "The draft could not be rejected." };
  }
  if (!rejected) {
    return { error: "Draft transaction not found or already handled." };
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.transaction.rejected",
      aggregateType: "transaction",
      aggregateId: rejected.id as string,
      payload: {
        source_document_id: (rejected.source_document_id as string | null) ?? null,
        reason: "user_rejected",
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "money_transactions",
      entityId: rejected.id as string,
      action: "delete",
      oldData: { status: "planned" },
      metadata: { source: "dashboard" },
    }),
  ]);

  // Dismiss the related Action Center review item(s).
  await supabase
    .from("action_items")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "transaction")
    .eq("source_id", transactionId)
    .in("status", ["open", "in_progress", "snoozed"]);

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.actions);
  if (rejected.source_document_id) {
    revalidatePath(`${ROUTES.documents}/${rejected.source_document_id}`);
  }
  return {};
}
