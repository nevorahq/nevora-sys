import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import {
  buildFinancialTaskExpenseIdempotencyKey,
  buildFinancialTaskExpenseTitle,
} from "./financial-task-keys";
import type { Task } from "../types/task.types";

type Result =
  | { ok: true; transactionId: string | null; alreadyPaid: boolean }
  | { ok: false; error: string };

type RpcResult = {
  already_paid: boolean;
  task_id: string;
  transaction_id: string | null;
  workspace_id?: string | null;
  source_document_id?: string | null;
  amount?: number;
  currency?: string;
};

/**
 * Mark a ONE-OFF financial task as paid.
 *
 * The money-critical steps (create the posted expense, mark the task paid +
 * complete it, link the transaction) run atomically inside the
 * `mark_financial_task_paid` RPC — amount/currency are re-read server-side from
 * the task row and can never be spoofed. This wrapper adds best-effort side
 * effects: entity links, domain events and audit logs.
 *
 * Idempotent: a task already paid returns its existing transaction and creates
 * nothing new — a duplicate click can never post a duplicate expense.
 *
 * Subscription payment tasks are NOT handled here — they carry a payment cycle
 * and go through markSubscriptionPaymentAsPaid (078) instead.
 */
export async function markFinancialTaskAsPaid(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  taskId: string;
  accountId: string;
  categoryId?: string | null;
  paidDate?: string | null;
}): Promise<Result> {
  const { supabase, ctx, taskId, accountId, categoryId, paidDate } = params;

  // Load the task (RLS-scoped) to build the expense title + resolve links.
  const { data: taskRow } = await supabase
    .from("todos")
    .select(
      "id, title, task_context_type, provider_name, amount, currency, financial_source_type, source_document_id, financial_status, workspace_id",
    )
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!taskRow) return { ok: false, error: "Financial task not found" };

  const task = taskRow as Pick<
    Task,
    "id" | "title" | "task_context_type" | "provider_name" | "amount" | "currency" | "financial_source_type" | "source_document_id" | "financial_status" | "workspace_id"
  >;

  if (task.task_context_type === "standard") {
    return { ok: false, error: "This is not a financial task" };
  }
  if (task.financial_source_type === "subscription_payment_cycle") {
    return { ok: false, error: "Use the subscription payment workflow to pay this task" };
  }

  // Money invariant: one document, one posted expense.
  //
  // A document can reach money by two routes — confirming its drafted expense, or
  // marking the financial task it produced as paid. Extraction now picks only one
  // of them, but a task created by hand from the document detail (or one that
  // predates that rule) can still meet an expense that was already confirmed.
  // Posting again would book the same invoice twice, so settle the task against
  // the expense that already exists instead of creating a second one.
  if (task.source_document_id) {
    const settled = await settleAgainstExistingExpense(supabase, ctx, task);
    if (settled) return settled;
  }

  const expenseTitle = buildFinancialTaskExpenseTitle(
    task.provider_name,
    task.task_context_type as Exclude<Task["task_context_type"], "standard">,
  );

  const { data, error } = await supabase.rpc("mark_financial_task_paid", {
    p_organization_id: ctx.org.id,
    p_task_id: taskId,
    p_account_id: accountId,
    p_paid_date: paidDate ?? null,
    p_category_id: categoryId ?? null,
    p_transaction_title: expenseTitle,
  });

  if (error) {
    console.error("[markFinancialTaskAsPaid] rpc failed:", error.message);
    return { ok: false, error: mapRpcError(error.message) };
  }

  const rpc = data as RpcResult;

  // Idempotent short-circuit: nothing new was written.
  if (rpc.already_paid) {
    return { ok: true, transactionId: rpc.transaction_id, alreadyPaid: true };
  }

  const workspaceId = (rpc.workspace_id ?? task.workspace_id) ?? undefined;
  const paidAt = new Date().toISOString();

  if (rpc.transaction_id) {
    // task --generated--> transaction; and, if a source document exists,
    // document --invoice_for--> transaction (mirrors the extraction pipeline).
    await createEntityLink({
      sourceType: "transaction",
      sourceId: rpc.transaction_id,
      targetType: "task",
      targetId: taskId,
      linkType: "generated_from",
      relationDirection: "derived",
      metadata: { source: "auto", matched_by: ["financial_task"] },
    });

    if (rpc.source_document_id) {
      await createEntityLink({
        sourceType: "document",
        sourceId: rpc.source_document_id,
        targetType: "transaction",
        targetId: rpc.transaction_id,
        linkType: "invoice_for_transaction",
        relationDirection: "direct",
        metadata: { source: "auto", matched_by: ["financial_task"] },
      });
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "money.transaction.created",
      aggregateType: "transaction",
      aggregateId: rpc.transaction_id,
      payload: {
        amount: Number(rpc.amount ?? task.amount ?? 0),
        currency: rpc.currency ?? task.currency ?? undefined,
        type: "expense",
        status: "posted",
        transaction_date: paidDate ?? paidAt.slice(0, 10),
      },
    });

    await emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "update",
      oldData: { financial_status: task.financial_status, status: "in_progress" },
      newData: { financial_status: "paid", status: "done", financial_transaction_id: rpc.transaction_id },
      metadata: {
        source: "dashboard",
        trigger: "financial_task.mark_as_paid",
        expense_idempotency_key: buildFinancialTaskExpenseIdempotencyKey(taskId),
      },
    });
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "financial_task.completed",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { transaction_id: rpc.transaction_id, paid_at: paidAt },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "task.completed",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title: task.title, completed_at: paidAt },
    }),
  ]);

  return { ok: true, transactionId: rpc.transaction_id, alreadyPaid: false };
}

/**
 * The expense for this task's source document may already be posted (the user
 * confirmed the drafted expense). In that case the obligation IS settled — the
 * money left the account — so the task is completed against that transaction and
 * NO second expense is written.
 *
 * Returns null when there is nothing to settle against, letting the caller take
 * the normal Mark-as-paid route (which posts the expense atomically via the RPC).
 *
 * Deliberately conservative: only an already-posted, non-deleted expense for the
 * exact same document counts. Best-effort, and never invents money.
 */
async function settleAgainstExistingExpense(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  task: Pick<Task, "id" | "title" | "source_document_id" | "financial_status" | "workspace_id">,
): Promise<Result | null> {
  const { data: existing } = await supabase
    .from("money_transactions")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("source_document_id", task.source_document_id as string)
    .eq("status", "posted")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existing) return null;

  const transactionId = existing.id as string;
  const paidAt = new Date().toISOString();

  const { error } = await supabase
    .from("todos")
    .update({
      financial_status: "paid",
      status: "done",
      financial_transaction_id: transactionId,
      updated_at: paidAt,
    })
    .eq("id", task.id)
    .eq("organization_id", ctx.org.id)
    .neq("financial_status", "paid");

  if (error) {
    console.error("[markFinancialTaskAsPaid] settle against existing expense failed:", error.message);
    return { ok: false, error: "Failed to record payment" };
  }

  await createEntityLink({
    sourceType: "transaction",
    sourceId: transactionId,
    targetType: "task",
    targetId: task.id,
    linkType: "generated_from",
    relationDirection: "derived",
    metadata: { source: "auto", matched_by: ["source_document"] },
  });

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: task.workspace_id ?? undefined,
      eventName: "financial_task.completed",
      aggregateType: "task",
      aggregateId: task.id,
      payload: { transaction_id: transactionId, paid_at: paidAt },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: task.id,
      action: "update",
      oldData: { financial_status: task.financial_status },
      newData: { financial_status: "paid", status: "done", financial_transaction_id: transactionId },
      metadata: {
        source: "dashboard",
        trigger: "financial_task.settled_against_existing_expense",
        expense_idempotency_key: buildFinancialTaskExpenseIdempotencyKey(task.id),
      },
    }),
  ]);

  // alreadyPaid: the expense existed before this click — nothing new was posted.
  return { ok: true, transactionId, alreadyPaid: true };
}

function mapRpcError(message: string): string {
  if (message.includes("task_not_found")) return "Financial task not found";
  if (message.includes("not_a_financial_task")) return "This is not a financial task";
  if (message.includes("task_not_payable")) return "This task can no longer be paid";
  if (message.includes("task_missing_amount")) return "This task has no amount to pay";
  if (message.includes("account_not_found")) return "Selected account was not found";
  if (message.includes("not_authorized")) return "You do not have permission to record this payment";
  return "Failed to record payment";
}
