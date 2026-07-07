"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { resolveActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { canTransition } from "../services/status-transitions";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/**
 * Resolve action item (safe).
 * Pipeline: Zod → requireOrg → permission → load (org-scoped) → transition
 * guard → update → action_item_event + domain_event + audit → revalidate.
 */
export async function resolveActionItem(
  input: { actionItemId: string; note?: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = resolveActionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "action_center.resolve", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { ok: false, error: err.message };
    throw err;
  }
  if (!canDo(ctx, "action_center.resolve")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const item = await loadActionItem(supabase, ctx.org.id, parsed.data.actionItemId);
  if (!item) return { ok: false, error: "Action item not found" };

  if (!canTransition(item.status, "resolved")) {
    return { ok: false, error: `Cannot resolve from status "${item.status}"` };
  }

  const { error } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[resolveActionItem] failed:", error.message);
    return { ok: false, error: "Failed to resolve action item" };
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.resolved",
    oldStatus: item.status,
    newStatus: "resolved",
    payload: { type: item.type, source_type: item.source_type, note: parsed.data.note ?? null },
    audit: { action: "status_change", oldData: { status: item.status }, newData: { status: "resolved" } },
  });

  revalidatePath(ROUTES.actions);
  return { ok: true, data: { id: item.id } };
}
