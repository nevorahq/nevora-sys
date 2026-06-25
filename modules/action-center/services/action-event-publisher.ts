import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAuditLog, emitDomainEvent, type DomainEventName } from "@/lib/events";
import type { AuditAction } from "@/lib/events";
import type { CurrentContext } from "@/lib/context/current-context";
import type { ActionItemStatus } from "../types/action-item.types";

interface PublishParams {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  actionItemId: string;
  /** Domain event name (action_item.*). */
  eventName: Extract<DomainEventName, `action_item.${string}`>;
  oldStatus?: ActionItemStatus | null;
  newStatus?: ActionItemStatus | null;
  /** Payload для domain event + action_item_event. */
  payload: Record<string, unknown>;
  /** Audit log для критичных действий (опционально). */
  audit?: {
    action: AuditAction;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  };
}

/**
 * Единая точка фиксации изменения action item:
 *   1. action_item_events (immutable история)
 *   2. domain_events (через emit_domain_event RPC)
 *   3. audit_logs (если действие критичное)
 *
 * Ни один из side-effect'ов не должен откатывать основную мутацию —
 * lib-хелперы логируют ошибки, но не бросают.
 */
export async function publishActionItemEvent({
  supabase,
  ctx,
  actionItemId,
  eventName,
  oldStatus,
  newStatus,
  payload,
  audit,
}: PublishParams): Promise<void> {
  // 1. action_item_events
  const { error } = await supabase.from("action_item_events").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    action_item_id: actionItemId,
    event_name: eventName,
    old_status: oldStatus ?? null,
    new_status: newStatus ?? null,
    payload,
    created_by: ctx.user.id,
  });
  if (error) {
    console.error("[publishActionItemEvent] action_item_events insert failed:", error.message);
  }

  // 2. domain event
  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName,
    aggregateType: "action_item",
    aggregateId: actionItemId,
    // payload типизирован per-event в DomainEventPayloadMap; здесь общий объект
    payload: payload as never,
  });

  // 3. audit log (критичные действия)
  if (audit) {
    await emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "action_item",
      entityId: actionItemId,
      action: audit.action,
      oldData: audit.oldData ?? null,
      newData: audit.newData ?? null,
      metadata: { source: "dashboard" },
    });
  }
}
