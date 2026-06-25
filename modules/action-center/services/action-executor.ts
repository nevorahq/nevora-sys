import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDo } from "@/lib/context/current-context";
import type { CurrentContext } from "@/lib/context/current-context";
import { executePermissionFor } from "./action-visibility-service";
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
  item: Pick<ActionItem, "id" | "source_type" | "source_id" | "primary_entity_id" | "title">,
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
    case "cancel_subscription":
      return cancelSubscription(supabase, ctx, item);
    case "approve_document":
      return approveDocument(supabase, ctx, item);
    default:
      return { ok: false, error: `Unsupported action: ${executeKind}` };
  }
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
