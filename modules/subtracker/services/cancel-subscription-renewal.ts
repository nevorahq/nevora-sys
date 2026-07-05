import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";

type Result = { ok: true; cancelledCycles: number; cancelledTasks: number } | { ok: false; error: string };

/**
 * Cancel a subscription's renewal. Terminal, money-free lifecycle action:
 * marks the subscription cancelled, cancels every open cycle and retires their
 * open payment tasks, and — crucially — creates no future cycles or tasks.
 */
export async function cancelSubscriptionRenewal(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  subscriptionId: string;
}): Promise<Result> {
  const { supabase, ctx, subscriptionId } = params;

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("id, name, is_active, cancelled_at")
    .eq("id", subscriptionId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!subRow) return { ok: false, error: "Subscription not found" };

  const now = new Date().toISOString();

  const { error: subError } = await supabase
    .from("subscriptions")
    .update({ is_active: false, cancelled_at: now, updated_by: ctx.user.id })
    .eq("id", subscriptionId)
    .eq("organization_id", ctx.org.id);
  if (subError) {
    console.error("[cancelSubscriptionRenewal] subscription update failed:", subError.message);
    return { ok: false, error: "Failed to cancel subscription" };
  }

  // Cancel open cycles and collect their tasks to retire.
  const { data: cancelledCycles } = await supabase
    .from("subscription_payment_cycles")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("subscription_id", subscriptionId)
    .eq("organization_id", ctx.org.id)
    .in("status", ["planned", "task_open"])
    .select("id, task_id");

  const taskIds = (cancelledCycles ?? [])
    .map((c) => c.task_id as string | null)
    .filter((id): id is string => Boolean(id));

  let cancelledTasks = 0;
  if (taskIds.length > 0) {
    const { data: retired } = await supabase
      .from("todos")
      .update({ deleted_at: now, updated_by: ctx.user.id })
      .in("id", taskIds)
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null)
      .select("id");
    cancelledTasks = retired?.length ?? 0;
  }

  const cancelledCount = cancelledCycles?.length ?? 0;

  await emitDomainEvent({
    organizationId: ctx.org.id,
    eventName: "subscription.cancelled",
    aggregateType: "subscription",
    aggregateId: subscriptionId,
    payload: {
      name: (subRow.name as string) ?? "",
      cancelled_at: now,
      open_cycles_cancelled: cancelledCount,
      open_tasks_cancelled: cancelledTasks,
    },
  });
  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "subscriptions",
    entityId: subscriptionId,
    action: "update",
    oldData: { is_active: subRow.is_active, cancelled_at: subRow.cancelled_at },
    newData: { is_active: false, cancelled_at: now },
    metadata: { source: "dashboard", trigger: "cancel_subscription", open_cycles_cancelled: cancelledCount },
  });

  return { ok: true, cancelledCycles: cancelledCount, cancelledTasks };
}
