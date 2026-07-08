import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { createBillingPeriodKey } from "./billing-period-key";
import { calculateNextPaymentDate, previousDay } from "./calculate-next-payment-date";
import { buildCycleIdempotencyKey } from "./subscription-payment-keys";

/**
 * Daily safety sweep for the subscription payment workflow.
 *
 * Repairs only — it NEVER creates money transactions, marks anything paid,
 * auto-posts expenses or creates duplicates:
 *   1. Active subscriptions with no open cycle get a planned cycle.
 *   2. Planned cycles missing a task get their payment task (promoted to
 *      task_open).
 *
 * Cross-org, so it uses the service-role client — the same established
 * exception as the extraction / suggestions sweeps. Idempotency is guaranteed
 * by the DB: unique(org, subscription, billing_period_key), the single-open
 * partial index, and the task_id IS NULL promote guard.
 */

const BATCH_LIMIT = 500;

export interface SubscriptionSweepResult {
  ok: boolean;
  configured: boolean;
  cyclesCreated: number;
  suggestionsCreated: number;
  /** Phase C keeps this for response compatibility; the sweep no longer creates tasks. */
  tasksCreated: number;
}

type ActiveSub = {
  id: string;
  organization_id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: "weekly" | "monthly" | "yearly";
  billing_anchor_day: number | null;
  next_billing_date: string;
  auto_task_enabled: boolean;
  workspace_id: string | null;
  created_by: string | null;
};

export async function sweepSubscriptionPaymentWorkflow(): Promise<SubscriptionSweepResult> {
  const log = logger.child({ scope: "subscription_sweep" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, configured: false, cyclesCreated: 0, suggestionsCreated: 0, tasksCreated: 0 };
  }

  let cyclesCreated = 0;
  let suggestionsCreated = 0;

  // ── 1. Active subscriptions without an open cycle → create a planned cycle ──
  const { data: openCycleRows } = await supabase
    .from("subscription_payment_cycles")
    .select("subscription_id")
    .in("status", ["planned", "task_open"]);
  const withOpenCycle = new Set((openCycleRows ?? []).map((r) => r.subscription_id as string));

  const { data: activeSubs, error: subsError } = await supabase
    .from("subscriptions")
    .select(
      "id, organization_id, name, amount, currency, billing_cycle, billing_anchor_day, next_billing_date, auto_task_enabled, workspace_id, created_by",
    )
    .eq("is_active", true)
    .is("cancelled_at", null)
    .eq("auto_task_enabled", true)
    .limit(BATCH_LIMIT);

  if (subsError) {
    log.error("subs_select_failed", { error: subsError.message });
    return { ok: false, configured: true, cyclesCreated, suggestionsCreated, tasksCreated: 0 };
  }

  for (const sub of (activeSubs ?? []) as ActiveSub[]) {
    if (withOpenCycle.has(sub.id)) continue;
    const dueDate = sub.next_billing_date;
    const periodKey = createBillingPeriodKey(dueDate, sub.billing_cycle);
    const nextDue = calculateNextPaymentDate(dueDate, sub.billing_cycle, sub.billing_anchor_day);

    const { data: inserted } = await supabase
      .from("subscription_payment_cycles")
      .insert({
        organization_id: sub.organization_id,
        workspace_id: sub.workspace_id,
        subscription_id: sub.id,
        period_start: dueDate,
        period_end: previousDay(nextDue),
        due_date: dueDate,
        billing_period_key: periodKey,
        expected_amount: sub.amount,
        currency: sub.currency,
        status: "planned",
        idempotency_key: buildCycleIdempotencyKey(sub.id, periodKey),
        created_by: sub.created_by,
      })
      .select("id")
      .maybeSingle();
    if (inserted) cyclesCreated += 1;
  }

  // ── 2. Planned cycles without a task → create reviewable suggestion ─────────
  const { data: orphanCycles } = await supabase
    .from("subscription_payment_cycles")
    .select("id, organization_id, workspace_id, subscription_id, billing_period_key, due_date, expected_amount, currency")
    .eq("status", "planned")
    .is("task_id", null)
    .limit(BATCH_LIMIT);

  for (const cycle of orphanCycles ?? []) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("name, auto_task_enabled, created_by, workspace_id")
      .eq("id", cycle.subscription_id as string)
      .maybeSingle();
    if (!sub || sub.auto_task_enabled === false) continue;

    const idempotencyKey = `subscription:${cycle.subscription_id}:task:pay_subscription:period:${cycle.billing_period_key}`;
    const { data: suggestion, error: suggestionError } = await supabase
      .from("financial_suggestions")
      .insert({
        organization_id: cycle.organization_id,
        workspace_id: (cycle.workspace_id as string | null) ?? (sub.workspace_id as string | null),
        source_type: "subscription",
        source_id: cycle.subscription_id,
        suggestion_type: "pay_subscription",
        review_state: "waiting_confirmation",
        amount: cycle.expected_amount,
        currency: cycle.currency,
        vendor_name: sub.name,
        due_date: cycle.due_date,
        confidence_score: 1,
        billing_period_key: cycle.billing_period_key,
        idempotency_key: idempotencyKey,
        metadata: {
          cycle_id: cycle.id,
          reason: "Upcoming subscription billing date detected by repair sweep.",
        },
        created_by: sub.created_by,
        updated_by: sub.created_by,
      })
      .select("id")
      .maybeSingle();
    if (suggestionError && suggestionError.code !== "23505") continue;

    let suggestionId = suggestion?.id as string | undefined;
    if (!suggestionId) {
      const { data: existing } = await supabase
        .from("financial_suggestions")
        .select("id")
        .eq("organization_id", cycle.organization_id as string)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      suggestionId = existing?.id as string | undefined;
    }
    if (!suggestionId) continue;

    const { data: actionItem } = await supabase
      .from("action_items")
      .insert({
        organization_id: cycle.organization_id,
        workspace_id: (cycle.workspace_id as string | null) ?? (sub.workspace_id as string | null),
        title: `Pay subscription: ${sub.name as string}`,
        description: "Suggested action: Pay subscription. State: Waiting confirmation.",
        type: "payment_required",
        status: "open",
        priority: "high",
        priority_score: 80,
        source_type: "subscription",
        source_id: cycle.subscription_id,
        source_entity_type: "subscription",
        source_entity_id: cycle.subscription_id,
        primary_entity_type: "subscription",
        primary_entity_id: cycle.subscription_id,
        review_state: "waiting_confirmation",
        suggestion_id: suggestionId,
        ai_generated: false,
        metadata: {
          suggestion_id: suggestionId,
          review_state: "waiting_confirmation",
          suggested_action: "pay_subscription",
          cycle_id: cycle.id,
          billing_period_key: cycle.billing_period_key,
          amount: cycle.expected_amount,
          currency: cycle.currency,
        },
        created_by: sub.created_by,
      })
      .select("id")
      .maybeSingle();
    if (actionItem || suggestion) suggestionsCreated += 1;
  }

  log.info("done", { cyclesCreated, suggestionsCreated, tasksCreated: 0 });
  return { ok: true, configured: true, cyclesCreated, suggestionsCreated, tasksCreated: 0 };
}
