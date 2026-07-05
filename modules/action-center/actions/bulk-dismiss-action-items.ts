"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { bulkDismissActionItemsSchema } from "../schemas/action-mutation.schema";
import { canTransition } from "../services/status-transitions";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionItemStatus, ActionResult } from "../types/action-item.types";

interface BulkDismissResult {
  ids: string[];
  dismissed: number;
  skipped: number;
}

const BULK_DISMISS_COLUMNS = "id, type, source_type, status" as const;

/** Bulk-dismiss selected action items so they leave active attention counts. */
export async function bulkDismissActionItems(
  input: { actionItemIds: string[]; reason?: string },
): Promise<ActionResult<BulkDismissResult>> {
  const parsed = bulkDismissActionItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.dismiss")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const uniqueIds = [...new Set(parsed.data.actionItemIds)];

  const { data: items, error: loadError } = await supabase
    .from("action_items")
    .select(BULK_DISMISS_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .in("id", uniqueIds);

  if (loadError) {
    console.error("[bulkDismissActionItems] load failed:", loadError.message);
    return { ok: false, error: "Failed to load selected actions" };
  }

  const dismissible = (items ?? []).filter((item) => canTransition(item.status as ActionItemStatus, "dismissed"));
  if (dismissible.length === 0) {
    return { ok: false, error: "No selected actions can be made inactive" };
  }

  const dismissedAt = new Date().toISOString();
  const ids = dismissible.map((item) => item.id as string);

  const { error: updateError } = await supabase
    .from("action_items")
    .update({ status: "dismissed", dismissed_at: dismissedAt })
    .eq("organization_id", ctx.org.id)
    .in("id", ids);

  if (updateError) {
    console.error("[bulkDismissActionItems] update failed:", updateError.message);
    return { ok: false, error: "Failed to make selected actions inactive" };
  }

  await Promise.all(dismissible.map((item) => publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id as string,
    eventName: "action_item.dismissed",
    oldStatus: item.status as ActionItemStatus,
    newStatus: "dismissed",
    payload: {
      type: item.type,
      source_type: item.source_type,
      reason: parsed.data.reason ?? "bulk_inactive",
      bulk: true,
    },
    audit: { action: "status_change", oldData: { status: item.status }, newData: { status: "dismissed" } },
  })));

  revalidatePath(ROUTES.actions);
  return {
    ok: true,
    data: {
      ids,
      dismissed: ids.length,
      skipped: uniqueIds.length - ids.length,
    },
  };
}
