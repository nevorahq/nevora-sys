import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import type { TaskContextType, FinancialSourceType } from "../constants/task.constants";
import { normalizeReminderOffset, calculateActionDueDate } from "./calculate-action-due-date";
import { buildFinancialTaskTitle } from "./financial-task-keys";

export interface CreateFinancialTaskInput {
  contextType: Exclude<TaskContextType, "standard">;
  providerName: string | null;
  amount: number | null;
  currency: string | null;
  /** Real payment/deadline date (YYYY-MM-DD). */
  financialDueDate: string;
  reminderOffsetDays?: number;
  sourceType: FinancialSourceType;
  /** Obligation source id (e.g. the document id). Powers idempotency. */
  sourceId: string | null;
  sourceDocumentId?: string | null;
  /** AI confidence that produced this obligation (0..1), when applicable. */
  confidence?: number | null;
  /** Optional explicit title (defaults to a context-derived title). */
  title?: string;
}

export type CreateFinancialTaskResult =
  | { ok: true; taskId: string; created: boolean; actionDueDate: string | null }
  | { ok: false; error: string };

/**
 * Create a Financial Context Task from a confirmed obligation.
 *
 * Money-safe: this NEVER posts a transaction — it only records a planned
 * obligation as a task with a financial due date (the task surfaces
 * `reminder_offset_days` before the real payment date). A posted expense is
 * created later, only via Mark-as-paid.
 *
 * Idempotent: keyed on (org, financial_source_type, financial_source_id) — the
 * same document can never spawn two financial tasks. Matches the
 * todos_financial_source_uniq index; an insert race surfaces as 23505 and is
 * resolved by re-reading the existing task.
 *
 * Like subscription payment tasks, financial tasks are system/AI-generated
 * obligation artifacts and are intentionally EXEMPT from the tasks.count plan
 * counter — a plan limit must never block recording a real financial obligation.
 */
export async function createFinancialTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateFinancialTaskInput,
): Promise<CreateFinancialTaskResult> {
  const offset = normalizeReminderOffset(input.reminderOffsetDays);
  const actionDueDate = calculateActionDueDate(input.financialDueDate, offset);

  // Idempotency short-circuit: an existing (non-deleted) task for this source.
  if (input.sourceId) {
    const { data: existing } = await supabase
      .from("todos")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("financial_source_type", input.sourceType)
      .eq("financial_source_id", input.sourceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return { ok: true, taskId: existing.id as string, created: false, actionDueDate };
    }
  }

  const taskId = randomUUID();
  const title = input.title?.trim() || buildFinancialTaskTitle(input.contextType, input.providerName);

  // Pre-generated UUID avoids INSERT ... RETURNING racing the assignee-trigger
  // SELECT RLS (same pattern as create-task.action / subscription payment task).
  const { error: insertError } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    title,
    description: "",
    priority: "high",
    // Active obligation with a due date → starts in progress (like subscription tasks).
    status: "in_progress",
    due_date: actionDueDate,
    recurrence: "none",
    // Financial context (whitelisted columns only — no mass assignment).
    task_context_type: input.contextType,
    financial_due_date: input.financialDueDate,
    reminder_offset_days: offset,
    amount: input.amount,
    currency: input.currency,
    provider_name: input.providerName,
    financial_source_type: input.sourceType,
    financial_source_id: input.sourceId,
    source_document_id: input.sourceDocumentId ?? null,
    financial_status: "open",
    financial_confidence: input.confidence ?? null,
  });

  if (insertError) {
    // Unique violation → a concurrent creator won; re-read and return it.
    if (insertError.code === "23505" && input.sourceId) {
      const { data: raced } = await supabase
        .from("todos")
        .select("id")
        .eq("organization_id", ctx.org.id)
        .eq("financial_source_type", input.sourceType)
        .eq("financial_source_id", input.sourceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (raced) return { ok: true, taskId: raced.id as string, created: false, actionDueDate };
    }
    console.error("[createFinancialTask] insert failed:", insertError.message);
    return { ok: false, error: "Failed to create financial task" };
  }

  // ── Best-effort side effects (never roll back a committed task) ──────────
  if (input.sourceDocumentId) {
    await createEntityLink({
      sourceType: "document",
      sourceId: input.sourceDocumentId,
      targetType: "task",
      targetId: taskId,
      linkType: "requires_action_task",
      relationDirection: "direct",
      metadata: {
        source: "auto",
        confidence: input.confidence ?? undefined,
        matched_by: ["financial_obligation"],
        context_type: input.contextType,
      },
    });
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority: "high", due_date: actionDueDate },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "financial_task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: {
        context_type: input.contextType,
        provider_name: input.providerName,
        amount: input.amount,
        currency: input.currency,
        financial_due_date: input.financialDueDate,
        reminder_offset_days: offset,
        action_due_date: actionDueDate,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_document_id: input.sourceDocumentId ?? null,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: {
        title,
        task_context_type: input.contextType,
        financial_due_date: input.financialDueDate,
        amount: input.amount,
        currency: input.currency,
        financial_status: "open",
      },
      metadata: { source: "dashboard", trigger: "financial_obligation" },
    }),
  ]);

  return { ok: true, taskId, created: true, actionDueDate };
}
