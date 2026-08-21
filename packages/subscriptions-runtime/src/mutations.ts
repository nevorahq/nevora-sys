import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionsRequestContext } from "@nevora/subscriptions-api";
import {
  PAYMENT_CYCLE_COLUMNS,
  buildCycleIdempotencyKey,
  buildSubscriptionPaymentTaskTitle,
  calculateNextPaymentDate,
  createBillingPeriodKey,
  previousDay,
  type CreateSubscriptionPaymentCycleInput,
  type CreateSubscriptionPaymentCycleResult,
  type CreateSubscriptionPaymentTaskInput,
  type CreateSubscriptionPaymentTaskResult,
  type SubscriptionPaymentCycle,
} from "@nevora/subscriptions-contracts";
import type { SubscriptionsRuntimeEffects } from "./effects";

/**
 * Insert a `planned` payment cycle for a subscription's given due date.
 *
 * Idempotent: a duplicate billing period (or an already-open cycle) resolves
 * to the existing row instead of failing, so retries and the safety-repair
 * cron never create duplicates. Creating a cycle NEVER creates a money
 * transaction.
 */
export async function createSubscriptionPaymentCycle(
  supabase: SupabaseClient,
  context: Readonly<SubscriptionsRequestContext>,
  effects: SubscriptionsRuntimeEffects,
  input: CreateSubscriptionPaymentCycleInput,
): Promise<CreateSubscriptionPaymentCycleResult> {
  const { subscription, dueDate } = input;

  const billingPeriodKey = createBillingPeriodKey(dueDate, subscription.billing_cycle);
  const nextDue = calculateNextPaymentDate(dueDate, subscription.billing_cycle, subscription.billing_anchor_day);
  const idempotencyKey = buildCycleIdempotencyKey(subscription.id, billingPeriodKey);

  const { data, error } = await supabase
    .from("subscription_payment_cycles")
    .insert({
      organization_id: context.organizationId,
      workspace_id: subscription.workspace_id ?? context.workspaceId,
      subscription_id: subscription.id,
      period_start: dueDate,
      period_end: previousDay(nextDue),
      due_date: dueDate,
      billing_period_key: billingPeriodKey,
      expected_amount: subscription.amount,
      currency: subscription.currency,
      status: "planned",
      idempotency_key: idempotencyKey,
      created_by: context.actorId,
    })
    .select(PAYMENT_CYCLE_COLUMNS)
    .single();

  if (error) {
    // 23505 — either this period already exists, or another open cycle blocks a
    // second one. Resolve to the existing open/period cycle (idempotent).
    if (error.code === "23505") {
      const existing = await findReusableCycle(supabase, context.organizationId, subscription.id, billingPeriodKey);
      if (existing) return { ok: true, cycle: existing, created: false };
    }
    console.error("[subscriptions-runtime] createSubscriptionPaymentCycle insert failed:", error.message);
    return { ok: false, error: "Failed to create payment cycle" };
  }

  const cycle = data as SubscriptionPaymentCycle;

  await effects.emitDomainEvent({
    eventName: "subscription.payment_cycle.created",
    aggregateType: "subscription_payment_cycle",
    aggregateId: cycle.id,
    payload: {
      subscription_id: subscription.id,
      cycle_id: cycle.id,
      billing_period_key: billingPeriodKey,
      due_date: dueDate,
      expected_amount: subscription.amount,
      currency: subscription.currency,
    },
  });
  await effects.emitAuditLog({
    entityType: "subscription_payment_cycles",
    entityId: cycle.id,
    action: "create",
    newData: { subscription_id: subscription.id, billing_period_key: billingPeriodKey, due_date: dueDate },
    metadata: { source: "dashboard" },
  });

  return { ok: true, cycle, created: true };
}

async function findReusableCycle(
  supabase: SupabaseClient,
  organizationId: string,
  subscriptionId: string,
  billingPeriodKey: string,
): Promise<SubscriptionPaymentCycle | null> {
  const { data: byKey } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .eq("billing_period_key", billingPeriodKey)
    .maybeSingle();
  if (byKey) return byKey as SubscriptionPaymentCycle;

  const { data: open } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .in("status", ["planned", "task_open"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (open as SubscriptionPaymentCycle | null) ?? null;
}

/**
 * Create the per-period payment task for a `planned` cycle and promote the
 * cycle to `task_open`. One task represents exactly one billing period — we
 * never mutate an old task to represent a new period.
 *
 * Idempotent: a cycle that already has a task, or is no longer open, is a
 * no-op. The cycle promotion is guarded on `task_id IS NULL` so a concurrent
 * caller cannot double-attach; a lost race leaves an orphan task the safety
 * cron can adopt, never a double-attached cycle.
 */
export async function createSubscriptionPaymentTaskForCycle(
  supabase: SupabaseClient,
  context: Readonly<SubscriptionsRequestContext>,
  effects: SubscriptionsRuntimeEffects,
  input: CreateSubscriptionPaymentTaskInput,
): Promise<CreateSubscriptionPaymentTaskResult> {
  const { subscription, cycle } = input;

  if (!subscription.auto_task_enabled) {
    return { ok: true, taskId: cycle.task_id ?? "", created: false };
  }
  if (cycle.task_id) {
    return { ok: true, taskId: cycle.task_id, created: false };
  }
  if (cycle.status !== "planned") {
    return { ok: true, taskId: "", created: false };
  }

  const title = buildSubscriptionPaymentTaskTitle(subscription.name, cycle.billing_period_key);
  const workspaceId = cycle.workspace_id ?? subscription.workspace_id ?? context.workspaceId;

  const taskResult = await effects.createGeneratedTask({
    title,
    dueDate: cycle.due_date,
    workspaceId,
  });
  if (!taskResult.ok) {
    return { ok: false, error: "Failed to create payment task" };
  }
  const taskId = taskResult.taskId;

  const { data: promoted, error: promoteError } = await supabase
    .from("subscription_payment_cycles")
    .update({ status: "task_open", task_id: taskId })
    .eq("id", cycle.id)
    .eq("organization_id", context.organizationId)
    .is("task_id", null)
    .select("id")
    .maybeSingle();

  if (promoteError || !promoted) {
    console.error("[subscriptions-runtime] cycle promote failed:", promoteError?.message);
    return { ok: false, error: "Failed to attach payment task to cycle" };
  }

  // Cross-module discoverability in the relation viewer (best-effort).
  await effects.linkSubscriptionToTask({
    subscriptionId: subscription.id,
    taskId,
    cycleId: cycle.id,
  });

  await Promise.all([
    effects.emitDomainEvent({
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority: "medium", due_date: cycle.due_date },
    }),
    effects.emitDomainEvent({
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
    effects.emitAuditLog({
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: { title, source: "subscription_payment_cycle", cycle_id: cycle.id },
      metadata: { source: "dashboard", trigger: "subscription_payment" },
    }),
  ]);

  return { ok: true, taskId, created: true };
}
