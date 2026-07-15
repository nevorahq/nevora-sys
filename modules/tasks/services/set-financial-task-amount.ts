import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import type { Task } from "../types/task.types";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Set the amount + currency on an open one-off financial task.
 *
 * Why this exists: a financial obligation can be captured without a number
 * ("оплатить аренду 20 числа" — a real due date, no amount). The task is then
 * created with amount = null, and Mark-as-paid refuses it (`task_missing_amount`),
 * so the obligation could never be settled — a dead end, since neither the Inbox
 * capture (cosmetic once accepted) nor the standard task edit touches the amount.
 *
 * Money-safety: this ONLY records the planned obligation amount on the task. It
 * never posts a transaction — the expense is still created solely by Mark-as-paid,
 * which re-reads amount/currency from this row inside the atomic RPC. The value is
 * therefore validated here AND at pay time.
 *
 * Guarded to open, non-subscription financial tasks: a paid task is immutable
 * (its amount already backs a posted expense), and subscription payment cycles are
 * priced by their own workflow.
 */
export async function setFinancialTaskAmount(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  taskId: string;
  amount: number;
  currency: string;
}): Promise<Result> {
  const { supabase, ctx, taskId, amount, currency } = params;

  const { data: taskRow } = await supabase
    .from("todos")
    .select("id, task_context_type, financial_source_type, financial_status, amount, currency, workspace_id")
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!taskRow) return { ok: false, error: "Financial task not found" };

  const task = taskRow as Pick<
    Task,
    "id" | "task_context_type" | "financial_source_type" | "financial_status" | "amount" | "currency" | "workspace_id"
  >;

  if (task.task_context_type === "standard") {
    return { ok: false, error: "This is not a financial task" };
  }
  if (task.financial_source_type === "subscription_payment_cycle") {
    return { ok: false, error: "Use the subscription workflow to price this payment" };
  }
  if (task.financial_status !== "open") {
    return { ok: false, error: "This task can no longer be edited" };
  }

  const { error } = await supabase
    .from("todos")
    .update({ amount, currency, updated_by: ctx.user.id, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .eq("financial_status", "open");
  if (error) {
    console.error("[setFinancialTaskAmount] update failed:", error.message);
    return { ok: false, error: "Failed to update the amount" };
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: task.workspace_id ?? undefined,
      eventName: "financial_task.amount_set",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { amount, currency, previous_amount: task.amount ?? null, previous_currency: task.currency ?? null },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "update",
      oldData: { amount: task.amount ?? null, currency: task.currency ?? null },
      newData: { amount, currency },
      metadata: { source: "dashboard", trigger: "financial_task.set_amount" },
    }),
  ]);

  return { ok: true };
}
