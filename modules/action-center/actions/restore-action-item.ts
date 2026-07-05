"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { restoreActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { canTransition } from "../services/status-transitions";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/**
 * Restore a resolved/dismissed action item back to the active list ("Recently
 * Resolved" → open). Optionally, when the item marks a DELETED record (currently
 * a deleted task, stamped with metadata.task_deleted), also undelete that record.
 *
 * Pipeline: Zod → requireOrg → permission → load → restore-transition guard →
 * reopen item (+ optional record undelete) → domain event + audit → revalidate.
 */
export async function restoreActionItem(
  input: { actionItemId: string; restoreRecord?: boolean },
): Promise<ActionResult<{ id: string; recordRestored: boolean }>> {
  const parsed = restoreActionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  // Restoring reverses a resolve/dismiss — gate on the same resolve permission.
  if (!canDo(ctx, "action_center.resolve")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const item = await loadActionItem(supabase, ctx.org.id, parsed.data.actionItemId);
  if (!item) return { ok: false, error: "Action item not found" };

  if (!canTransition(item.status, "open", { restore: true })) {
    return { ok: false, error: `Cannot restore from status "${item.status}"` };
  }

  // Should we also undelete the underlying record? Only for a deleted-task marker
  // and only if the caller can write data.
  const marksDeletedTask =
    item.metadata?.task_deleted === true &&
    item.source_type === "task" &&
    typeof item.primary_entity_id === "string";
  const wantRecordRestore = parsed.data.restoreRecord && marksDeletedTask && canDo(ctx, "data.write");

  let recordRestored = false;
  if (wantRecordRestore) {
    const { error: undeleteError } = await supabase
      .from("todos")
      .update({ deleted_at: null, updated_by: ctx.user.id })
      .eq("id", item.primary_entity_id as string)
      .eq("organization_id", ctx.org.id)
      .not("deleted_at", "is", null);
    if (undeleteError) {
      console.error("[restoreActionItem] undelete record failed:", undeleteError.message);
      return { ok: false, error: "Failed to restore the deleted record" };
    }
    recordRestored = true;
  }

  // Strip the deletion marker if the record came back, so the reopened card no
  // longer shows "Deleted".
  const nextMetadata = recordRestored
    ? stripDeletionMarker(item.metadata)
    : item.metadata;

  const { error } = await supabase
    .from("action_items")
    .update({ status: "open", resolved_at: null, dismissed_at: null, metadata: nextMetadata })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[restoreActionItem] failed:", error.message);
    return { ok: false, error: "Failed to restore action item" };
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.restored",
    oldStatus: item.status,
    newStatus: "open",
    payload: { type: item.type, source_type: item.source_type, record_restored: recordRestored },
    audit: {
      action: "status_change",
      oldData: { status: item.status },
      newData: { status: "open", record_restored: recordRestored },
    },
  });

  revalidatePath(ROUTES.actions);
  if (recordRestored) {
    revalidatePath(ROUTES.tasks);
    revalidatePath(ROUTES.dashboard);
  }
  return { ok: true, data: { id: item.id, recordRestored } };
}

function stripDeletionMarker(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next.task_deleted;
  delete next.deleted_title;
  if (next.source === "task_delete") delete next.source;
  return next;
}
