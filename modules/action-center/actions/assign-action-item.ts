"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { assignActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/**
 * Assign action item. assigneeId === null снимает назначение.
 * Cross-tenant guard: ответственный обязан быть active member этой org.
 */
export async function assignActionItem(
  input: { actionItemId: string; assigneeId: string | null },
): Promise<ActionResult<{ id: string }>> {
  const parsed = assignActionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.assign")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const item = await loadActionItem(supabase, ctx.org.id, parsed.data.actionItemId);
  if (!item) return { ok: false, error: "Action item not found" };

  // Назначить можно только active члена этой организации.
  if (parsed.data.assigneeId) {
    const { data: member } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("user_id", parsed.data.assigneeId)
      .eq("status", "active")
      .maybeSingle();
    if (!member) return { ok: false, error: "Assignee must be an active member of this organization" };
  }

  const { error } = await supabase
    .from("action_items")
    .update({ assigned_to: parsed.data.assigneeId })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[assignActionItem] failed:", error.message);
    return { ok: false, error: "Failed to assign action item" };
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.assigned",
    payload: { assigned_to: parsed.data.assigneeId ?? "" },
    audit: {
      action: parsed.data.assigneeId ? "assign" : "unassign",
      oldData: { assigned_to: item.assigned_to },
      newData: { assigned_to: parsed.data.assigneeId },
    },
  });

  revalidatePath(ROUTES.actions);
  return { ok: true, data: { id: item.id } };
}
