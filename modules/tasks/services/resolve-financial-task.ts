import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";

type Resolution = "skipped" | "dismissed";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Resolve a financial task WITHOUT posting money:
 *   skipped   — the obligation was handled outside Business OS (paid elsewhere).
 *   dismissed — a false-positive obligation (e.g. a bad AI detection).
 *
 * Both close the task (status done) and set the corresponding financial_status.
 * Idempotent-ish: only an `open` financial task can be resolved; anything else is
 * rejected so a paid task can never be silently overwritten.
 */
export async function resolveFinancialTask(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  taskId: string;
  resolution: Resolution;
  reason?: string | null;
}): Promise<Result> {
  const { supabase, ctx, taskId, resolution, reason } = params;

  const { data: task } = await supabase
    .from("todos")
    .select("id, task_context_type, financial_status, workspace_id, financial_source_type, source_document_id")
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { ok: false, error: "Financial task not found" };
  if (task.task_context_type === "standard") return { ok: false, error: "This is not a financial task" };
  if (task.financial_status !== "open") {
    return { ok: false, error: `This task is already ${task.financial_status}` };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("todos")
    .update({
      financial_status: resolution,
      financial_skipped_at: nowIso,
      status: "done",
      is_completed: true,
      updated_by: ctx.user.id,
    })
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .eq("financial_status", "open"); // guard against a concurrent transition
  if (error) {
    console.error("[resolveFinancialTask] update failed:", error.message);
    return { ok: false, error: "Failed to update financial task" };
  }

  const workspaceId = (task.workspace_id as string | null) ?? undefined;

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: resolution === "skipped" ? "financial_task.skipped" : "financial_task.dismissed",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { reason: reason ?? null, resolved_at: nowIso },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: resolution === "skipped" ? "financial_obligation.skipped" : "financial_obligation.dismissed",
      aggregateType: "task",
      aggregateId: taskId,
      payload: {
        source_type: task.financial_source_type ?? null,
        source_document_id: task.source_document_id ?? null,
        reason: reason ?? null,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "update",
      oldData: { financial_status: "open" },
      newData: { financial_status: resolution, status: "done" },
      metadata: { source: "dashboard", trigger: `financial_task.${resolution}`, reason: reason ?? null },
    }),
  ]);

  return { ok: true };
}
