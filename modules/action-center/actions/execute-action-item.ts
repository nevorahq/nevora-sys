"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { executeActionItemSchema } from "../schemas/action-mutation.schema";
import { loadActionItem } from "../services/load-action-item";
import { canTransition } from "../services/status-transitions";
import { executeAction } from "../services/action-executor";
import { executePermissionFor } from "../services/action-visibility-service";
import { publishActionItemEvent } from "../services/action-event-publisher";
import type { ActionResult } from "../types/action-item.types";

/**
 * Execute quick action (safe или dangerous).
 *
 * Безопасность: scoped permission (execute / execute.financial / ...),
 * dangerous требует confirmed=true. AI не вызывает это напрямую — действие
 * инициирует пользователь. На успех item resolved; на ошибку — action_item.failed.
 */
export async function executeActionItem(
  input: { actionItemId: string; executeKind: string; confirmed?: boolean },
): Promise<ActionResult<{ id: string; summary: string }>> {
  const parsed = executeActionItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { permission, dangerous } = executePermissionFor(parsed.data.executeKind);

  // Execute is a side-effecting action (may post a transaction / create a task):
  // the scoped permission + billing execute-entitlement funnel through the gate.
  // execute is denied once the org is not writable (spec: financial/AI execution
  // denied on an expired trial).
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission, intent: "execute" });
  } catch (err) {
    if (isAccessError(err)) return { ok: false, error: err.message };
    throw err;
  }
  if (!canDo(ctx, permission)) return { ok: false, error: "Forbidden" };
  if (dangerous && !parsed.data.confirmed) {
    return { ok: false, error: "This action requires explicit confirmation" };
  }

  const supabase = await createClient();
  const item = await loadActionItem(supabase, ctx.org.id, parsed.data.actionItemId);
  if (!item) return { ok: false, error: "Action item not found" };
  if (!canTransition(item.status, "resolved")) {
    return { ok: false, error: `Cannot execute from status "${item.status}"` };
  }

  const exec = await executeAction(supabase, ctx, item, parsed.data.executeKind, parsed.data.confirmed);

  if (!exec.ok) {
    await publishActionItemEvent({
      supabase,
      ctx,
      actionItemId: item.id,
      eventName: "action_item.failed",
      payload: { action: parsed.data.executeKind, error: exec.error },
    });
    return { ok: false, error: exec.error };
  }

  await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("organization_id", ctx.org.id);

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: item.id,
    eventName: "action_item.executed",
    oldStatus: item.status,
    newStatus: "resolved",
    payload: { action: parsed.data.executeKind, confirmed: parsed.data.confirmed },
    audit: {
      action: "update",
      newData: { executed: parsed.data.executeKind, summary: exec.data.summary },
    },
  });

  revalidatePath(ROUTES.actions);
  revalidatePath(ROUTES.dashboard);
  if (parsed.data.executeKind === "delete_task") revalidatePath(ROUTES.tasks);
  if (parsed.data.executeKind === "delete_subscription") revalidatePath(ROUTES.subscriptions);
  if (parsed.data.executeKind === "delete_planner_entry") revalidatePath(ROUTES.inbox);
  return { ok: true, data: { id: item.id, summary: exec.data.summary } };
}
