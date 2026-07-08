import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDo } from "@/lib/context/current-context";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { executePermissionFor } from "./action-visibility-service";
import {
  confirmFinancialSuggestionRecord,
  confirmSubscriptionTaskSuggestionRecord,
  rejectFinancialSuggestionRecord,
} from "@/modules/review/services/financial-suggestion.service";
import type { ActionItem, ActionResult } from "../types/action-item.types";

/**
 * Action Executor (Phase 3 §15).
 *
 * Выполняет quick action как side-effect в исходном модуле. Defense in depth:
 * заново проверяет scoped permission и confirmed-флаг для dangerous-действий
 * (мутация уже проверила, но executor не доверяет вызывающему).
 *
 * AI НИКОГДА не вызывает executor с финансовыми/destructive kind напрямую —
 * это всегда инициирует человек с нужным permission и confirmed=true.
 */
export async function executeAction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "id" | "source_type" | "source_id" | "primary_entity_id" | "title" | "metadata" | "suggestion_id">,
  executeKind: string,
  confirmed: boolean,
): Promise<ActionResult<{ summary: string }>> {
  const { permission, dangerous } = executePermissionFor(executeKind);

  if (!canDo(ctx, permission)) {
    return { ok: false, error: "Forbidden" };
  }
  if (dangerous && !confirmed) {
    return { ok: false, error: "This action requires explicit confirmation" };
  }

  switch (executeKind) {
    case "create_task_draft":
      return createTaskDraft(supabase, ctx, item);
    case "confirm_transaction":
      return confirmTransaction(supabase, ctx, item);
    case "confirm_financial_suggestion":
      return confirmFinancialSuggestion(supabase, ctx, item);
    case "reject_financial_suggestion":
      return rejectFinancialSuggestion(supabase, ctx, item);
    case "confirm_subscription_task_suggestion":
      return confirmSubscriptionTaskSuggestion(supabase, ctx, item);
    case "cancel_subscription":
      return cancelSubscription(supabase, ctx, item);
    case "approve_document":
      return approveDocument(supabase, ctx, item);
    case "delete_task":
      return deleteTask(supabase, ctx, item);
    case "delete_subscription":
      return deleteSubscription(supabase, ctx, item);
    case "delete_planner_entry":
      return deletePlannerEntry(supabase, ctx, item);
    default:
      return { ok: false, error: `Unsupported action: ${executeKind}` };
  }
}

async function confirmFinancialSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "metadata" | "suggestion_id">,
): Promise<ActionResult<{ summary: string }>> {
  const suggestionId = item.suggestion_id ?? (typeof item.metadata?.suggestion_id === "string" ? item.metadata.suggestion_id : null);
  if (!suggestionId) return { ok: false, error: "Action is not linked to a suggestion" };
  const result = await confirmFinancialSuggestionRecord(supabase, ctx, { suggestionId });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { summary: "Financial suggestion confirmed" } };
}

async function rejectFinancialSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "metadata" | "suggestion_id">,
): Promise<ActionResult<{ summary: string }>> {
  const suggestionId = item.suggestion_id ?? (typeof item.metadata?.suggestion_id === "string" ? item.metadata.suggestion_id : null);
  if (!suggestionId) return { ok: false, error: "Action is not linked to a suggestion" };
  const result = await rejectFinancialSuggestionRecord(supabase, ctx, {
    suggestionId,
    reason: "Rejected from Action Center",
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { summary: "Suggestion rejected" } };
}

async function confirmSubscriptionTaskSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "metadata" | "suggestion_id">,
): Promise<ActionResult<{ summary: string }>> {
  const suggestionId = item.suggestion_id ?? (typeof item.metadata?.suggestion_id === "string" ? item.metadata.suggestion_id : null);
  if (!suggestionId) return { ok: false, error: "Action is not linked to a suggestion" };
  const result = await confirmSubscriptionTaskSuggestionRecord(supabase, ctx, { suggestionId });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { summary: "Subscription task created" } };
}

async function createTaskDraft(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "title">,
): Promise<ActionResult<{ summary: string }>> {
  const { error } = await supabase.from("todos").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    title: `Follow up: ${item.title}`.slice(0, 200),
    status: "todo",
    priority: "medium",
  });
  if (error) {
    console.error("[executeAction] create_task_draft failed:", error.message);
    return { ok: false, error: "Failed to create task draft" };
  }
  return { ok: true, data: { summary: "Task draft created" } };
}

async function confirmTransaction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_id">,
): Promise<ActionResult<{ summary: string }>> {
  const { data, error } = await supabase
    .from("money_transactions")
    .update({ status: "posted" })
    .eq("id", item.source_id)
    .eq("organization_id", ctx.org.id)
    .eq("status", "planned")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[executeAction] confirm_transaction failed:", error.message);
    return { ok: false, error: "Failed to confirm transaction" };
  }
  if (!data) return { ok: false, error: "Transaction not found or already posted" };
  return { ok: true, data: { summary: "Transaction confirmed (posted)" } };
}

async function cancelSubscription(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_id">,
): Promise<ActionResult<{ summary: string }>> {
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ is_active: false })
    .eq("id", item.source_id)
    .eq("organization_id", ctx.org.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[executeAction] cancel_subscription failed:", error.message);
    return { ok: false, error: "Failed to cancel subscription" };
  }
  if (!data) return { ok: false, error: "Subscription not found" };
  return { ok: true, data: { summary: "Subscription cancelled" } };
}

async function approveDocument(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_id">,
): Promise<ActionResult<{ summary: string }>> {
  const { data, error } = await supabase
    .from("documents")
    .update({ status: "published", updated_by: ctx.user.id })
    .eq("id", item.source_id)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[executeAction] approve_document failed:", error.message);
    return { ok: false, error: "Failed to approve document" };
  }
  if (!data) return { ok: false, error: "Document not found" };
  return { ok: true, data: { summary: "Document approved (published)" } };
}

async function deleteTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_type" | "source_id" | "primary_entity_id">,
): Promise<ActionResult<{ summary: string }>> {
  const taskId = entityIdFor(item, "task");
  if (!taskId) return { ok: false, error: "Action is not linked to a task" };

  const { data: task, error: lookupError } = await supabase
    .from("todos")
    .select("id, title")
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("[executeAction] delete_task lookup failed:", lookupError.message);
    return { ok: false, error: "Failed to load task" };
  }
  if (!task) return { ok: false, error: "Task not found or already deleted" };

  const { error } = await supabase
    .from("todos")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq("id", task.id)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null);
  if (error) {
    console.error("[executeAction] delete_task failed:", error.message);
    return { ok: false, error: "Failed to delete task" };
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "task.deleted",
      aggregateType: "task",
      aggregateId: task.id as string,
      payload: { title: task.title as string },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: task.id as string,
      action: "delete",
      oldData: { title: task.title as string },
      metadata: { source: "dashboard", via: "action_center" },
    }),
  ]);

  return { ok: true, data: { summary: "Task deleted" } };
}

async function deleteSubscription(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_type" | "source_id" | "primary_entity_id">,
): Promise<ActionResult<{ summary: string }>> {
  const subscriptionId = entityIdFor(item, "subscription");
  if (!subscriptionId) return { ok: false, error: "Action is not linked to a subscription" };

  const { data: subscription, error: lookupError } = await supabase
    .from("subscriptions")
    .select("id, name, workspace_id")
    .eq("id", subscriptionId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (lookupError) {
    console.error("[executeAction] delete_subscription lookup failed:", lookupError.message);
    return { ok: false, error: "Failed to load subscription" };
  }
  if (!subscription) return { ok: false, error: "Subscription not found" };

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", subscription.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[executeAction] delete_subscription failed:", error.message);
    return { ok: false, error: "Failed to delete subscription" };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: (subscription.workspace_id as string | null) ?? undefined,
    eventName: "subscription.deleted",
    aggregateType: "subscription",
    aggregateId: subscription.id as string,
    payload: { name: subscription.name as string },
  });

  return { ok: true, data: { summary: "Subscription deleted" } };
}

async function deletePlannerEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  item: Pick<ActionItem, "source_type" | "source_id" | "primary_entity_id">,
): Promise<ActionResult<{ summary: string }>> {
  if (item.source_type !== "ai") return { ok: false, error: "Action is not linked to an Inbox entry" };
  const entryId = await resolvePlannerEntryId(supabase, ctx, item.source_id, item.primary_entity_id);
  if (!entryId) return { ok: false, error: "Inbox entry not found" };

  const { data: suggestions } = await supabase
    .from("planner_suggestions")
    .select("id")
    .eq("planner_entry_id", entryId)
    .eq("organization_id", ctx.org.id);

  const { data: entry, error } = await supabase
    .from("planner_entries")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("organization_id", ctx.org.id)
    .neq("status", "archived")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[executeAction] delete_planner_entry failed:", error.message);
    return { ok: false, error: "Failed to delete Inbox entry" };
  }
  if (!entry) return { ok: false, error: "Inbox entry not found or already deleted" };

  const sourceIds = [
    entryId,
    ...(suggestions ?? []).map((suggestion) => suggestion.id as string),
  ];
  await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "ai")
    .in("source_id", sourceIds)
    .in("status", ["open", "in_progress", "snoozed", "failed"]);

  return { ok: true, data: { summary: "Inbox entry deleted" } };
}

function entityIdFor(
  item: Pick<ActionItem, "source_type" | "source_id" | "primary_entity_id">,
  entityType: ActionItem["source_type"],
): string | null {
  if (item.source_type === entityType) return item.source_id;
  return item.primary_entity_id;
}

async function resolvePlannerEntryId(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  sourceId: string,
  primaryEntityId: string | null,
): Promise<string | null> {
  const directIds = [primaryEntityId, sourceId].filter(Boolean) as string[];
  if (directIds.length > 0) {
    const { data: entry } = await supabase
      .from("planner_entries")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .in("id", directIds)
      .maybeSingle();
    if (entry?.id) return entry.id as string;
  }

  const { data: suggestion } = await supabase
    .from("planner_suggestions")
    .select("planner_entry_id")
    .eq("organization_id", ctx.org.id)
    .in("id", directIds.length > 0 ? directIds : [sourceId])
    .maybeSingle();
  return (suggestion?.planner_entry_id as string | undefined) ?? null;
}
