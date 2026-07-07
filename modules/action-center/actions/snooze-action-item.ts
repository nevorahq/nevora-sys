"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { snoozeActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { canTransition } from "../services/status-transitions";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/** Snooze action item (safe). Откладывает до snoozedUntil. */
export async function snoozeActionItem(
  input: { actionItemId: string; snoozedUntil: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = snoozeActionItemSchema.safeParse(input);
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

  if (!canTransition(item.status, "snoozed")) {
    return { ok: false, error: `Cannot snooze from status "${item.status}"` };
  }

  const { error } = await supabase
    .from("action_items")
    .update({ status: "snoozed", snoozed_until: parsed.data.snoozedUntil })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[snoozeActionItem] failed:", error.message);
    return { ok: false, error: "Failed to snooze action item" };
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.snoozed",
    oldStatus: item.status,
    newStatus: "snoozed",
    payload: { snoozed_until: parsed.data.snoozedUntil },
  });

  revalidatePath(ROUTES.actions);
  return { ok: true, data: { id: item.id } };
}
