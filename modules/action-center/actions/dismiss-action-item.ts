"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { dismissActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { canTransition } from "../services/status-transitions";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/** Dismiss action item (safe). */
export async function dismissActionItem(
  input: { actionItemId: string; reason?: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = dismissActionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "action_center.dismiss", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { ok: false, error: err.message };
    throw err;
  }
  if (!canDo(ctx, "action_center.dismiss")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const item = await loadActionItem(supabase, ctx.org.id, parsed.data.actionItemId);
  if (!item) return { ok: false, error: "Action item not found" };

  if (!canTransition(item.status, "dismissed")) {
    return { ok: false, error: `Cannot dismiss from status "${item.status}"` };
  }

  const { error } = await supabase
    .from("action_items")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[dismissActionItem] failed:", error.message);
    return { ok: false, error: "Failed to dismiss action item" };
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.dismissed",
    oldStatus: item.status,
    newStatus: "dismissed",
    payload: { type: item.type, source_type: item.source_type, reason: parsed.data.reason ?? null },
    audit: { action: "status_change", oldData: { status: item.status }, newData: { status: "dismissed" } },
  });

  revalidatePath(ROUTES.actions);
  return { ok: true, data: { id: item.id } };
}
