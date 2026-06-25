import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { dispatchDomainEvent } from "@/modules/automation";
import { publishDomainEventSchema } from "./domain-event.schema";
import type {
  DomainEventName,
  EmitDomainEventParams,
} from "./domain-event.types";

/**
 * Записывает domain event в БД через Supabase RPC.
 *
 * Вызывается ПОСЛЕ успешной бизнес-операции в Server Action.
 * Ошибка записи события НЕ должна откатывать основную операцию —
 * поэтому функция логирует ошибку, но не бросает исключение.
 *
 * Пример использования в Server Action:
 *
 *   await emitDomainEvent({
 *     organizationId: ctx.org.id,
 *     workspaceId: ctx.workspace.id,
 *     eventName: "task.created",
 *     aggregateType: "task",
 *     aggregateId: newTask.id,
 *     payload: { title: newTask.title, priority: newTask.priority },
 *   });
 */
export async function emitDomainEvent<T extends DomainEventName>(
  params: EmitDomainEventParams<T>,
): Promise<void> {
  const parsed = publishDomainEventSchema.safeParse(params);
  if (!parsed.success) {
    console.error("[emitDomainEvent] invalid input:", parsed.error.issues[0]?.message);
    return;
  }
  try {
    const ctx = await requireOrg();
    if (parsed.data.organizationId !== ctx.org.id) {
      console.error("[emitDomainEvent] organization mismatch");
      return;
    }
    const supabase = await createClient();

    const { data: eventId, error } = await supabase.rpc("emit_domain_event", {
      p_organization_id: ctx.org.id,
      p_event_name: parsed.data.eventName,
      p_aggregate_type: parsed.data.aggregateType,
      p_aggregate_id: parsed.data.aggregateId,
      p_payload: parsed.data.payload,
      p_workspace_id: parsed.data.workspaceId ?? null,
    });

    if (error || !eventId) {
      console.error("[emitDomainEvent] failed:", {
        event: params.eventName,
        aggregateId: params.aggregateId,
        error: error?.message,
      });
      return;
    }

    // Событие записано — запускаем автоматизации.
    // dispatchDomainEvent сам не бросает: ошибка хендлера попадёт в
    // automation_audit_logs, но НЕ откатит исходное действие пользователя.
    await dispatchDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: parsed.data.workspaceId ?? null,
      eventId: eventId as string,
      eventName: parsed.data.eventName,
      aggregateType: parsed.data.aggregateType as never,
      aggregateId: parsed.data.aggregateId,
      payload: parsed.data.payload,
    });
  } catch (err) {
    console.error("[emitDomainEvent] unexpected error:", err);
  }
}
