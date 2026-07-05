import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { buildSubscriptionPaymentTaskTitle } from "./subscription-payment-keys";
import type { SubscriptionForPayment, SubscriptionPaymentCycle } from "../types/payment-cycle.types";

type Result =
  | { ok: true; taskId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Create the per-period payment task for a `planned` cycle and promote the cycle
 * to `task_open`. One task represents exactly one billing period — we never
 * mutate an old task to represent a new period.
 *
 * Idempotent: a cycle that already has a task, or is no longer open, is a no-op.
 * Subscription payment tasks are system-generated recurring artifacts and are
 * intentionally EXEMPT from plan usage counters (never block recording a real
 * payment on a plan limit).
 */
export async function createSubscriptionPaymentTaskForCycle(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  subscription: Pick<SubscriptionForPayment, "id" | "name" | "auto_task_enabled" | "workspace_id">;
  cycle: SubscriptionPaymentCycle;
}): Promise<Result> {
  const { supabase, ctx, subscription, cycle } = params;

  if (!subscription.auto_task_enabled) {
    return { ok: true, taskId: cycle.task_id ?? "", created: false };
  }
  if (cycle.task_id) {
    return { ok: true, taskId: cycle.task_id, created: false };
  }
  if (cycle.status !== "planned") {
    return { ok: true, taskId: "", created: false };
  }

  const taskId = randomUUID();
  const title = buildSubscriptionPaymentTaskTitle(subscription.name, cycle.billing_period_key);
  const workspaceId = cycle.workspace_id ?? subscription.workspace_id ?? ctx.workspace.id;

  // Pre-generated UUID avoids INSERT ... RETURNING racing the task-scoped SELECT
  // RLS before the AFTER INSERT assignee trigger commits (same pattern as
  // create-task.action).
  const { error: taskError } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: ctx.org.id,
    workspace_id: workspaceId,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    title,
    description: "",
    priority: "medium",
    // Subscription payment tasks start in progress (they represent an active
    // obligation with a due date), unlike generic tasks which start as 'todo'.
    status: "in_progress",
    due_date: cycle.due_date,
    recurrence: "none",
  });

  if (taskError) {
    console.error("[createSubscriptionPaymentTaskForCycle] task insert failed:", taskError.message);
    return { ok: false, error: "Failed to create payment task" };
  }

  // Promote the cycle. Guard on task_id IS NULL so a concurrent creator cannot
  // double-attach; a lost race leaves an orphan todo the safety cron can adopt.
  const { data: promoted, error: promoteError } = await supabase
    .from("subscription_payment_cycles")
    .update({ status: "task_open", task_id: taskId })
    .eq("id", cycle.id)
    .eq("organization_id", ctx.org.id)
    .is("task_id", null)
    .select("id")
    .maybeSingle();

  if (promoteError || !promoted) {
    console.error("[createSubscriptionPaymentTaskForCycle] cycle promote failed:", promoteError?.message);
    return { ok: false, error: "Failed to attach payment task to cycle" };
  }

  // Cross-module discoverability in the relation viewer (best-effort).
  await createEntityLink({
    sourceType: "subscription",
    sourceId: subscription.id,
    targetType: "task",
    targetId: taskId,
    linkType: "renewal_task",
    relationDirection: "bidirectional",
    metadata: { source: "auto", matched_by: ["subscription_payment_cycle"], cycle_id: cycle.id },
  });

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: workspaceId ?? undefined,
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority: "medium", due_date: cycle.due_date },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: workspaceId ?? undefined,
      eventName: "subscription.payment_task.created",
      aggregateType: "subscription_payment_cycle",
      aggregateId: cycle.id,
      payload: {
        subscription_id: subscription.id,
        cycle_id: cycle.id,
        task_id: taskId,
        billing_period_key: cycle.billing_period_key,
        due_date: cycle.due_date,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: { title, source: "subscription_payment_cycle", cycle_id: cycle.id },
      metadata: { source: "dashboard", trigger: "subscription_payment" },
    }),
  ]);

  return { ok: true, taskId, created: true };
}
