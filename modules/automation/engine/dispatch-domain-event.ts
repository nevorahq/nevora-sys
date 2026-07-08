"use server";

import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import { DOMAIN_EVENT_NAMES } from "@/lib/events/domain-event-names";
import { assertPlanEntitlement, assertPlanLimit } from "@/modules/billing";
import { createAutomationLog } from "../logs/create-automation-log";
import { getHandlersForEvent } from "./automation-registry";
import type { AutomationContext } from "./automation-handler.types";
import type {
  DomainEventName,
  AggregateType,
} from "@/lib/events/domain-event.types";

/**
 * Вход dispatchDomainEvent — то, что движок знает о только что записанном
 * событии. Валидируется Zod перед запуском хендлеров.
 */
export interface DispatchDomainEventInput {
  organizationId: string;
  workspaceId?: string | null;
  eventId: string;
  eventName: DomainEventName;
  aggregateType: AggregateType;
  aggregateId: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
}

const dispatchDomainEventSchema = z.object({
  organizationId: uuidSchema,
  workspaceId: uuidSchema.nullish(),
  eventId: uuidSchema,
  eventName: z.enum(DOMAIN_EVENT_NAMES),
  aggregateType: z.string().trim().min(1),
  aggregateId: uuidSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  actorId: uuidSchema.nullish(),
});

/**
 * Запустить автоматизации для записанного domain-события.
 *
 * Поток:
 *   emitDomainEvent() → insert domain_events → dispatchDomainEvent(event)
 *     → найти подписанные хендлеры в registry
 *     → запустить каждый в изоляции (try/catch)
 *     → записать результат в automation_audit_logs
 *
 * Гарантии:
 *   • Ошибка одного хендлера НЕ ломает другие и НЕ ломает исходное действие
 *     пользователя (всё обёрнуто в try/catch, dispatch сам не бросает).
 *   • Каждый запуск логируется: executed | failed | skipped.
 */
export async function dispatchDomainEvent(
  input: DispatchDomainEventInput,
): Promise<void> {
  const parsed = dispatchDomainEventSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "[dispatchDomainEvent] invalid input:",
      parsed.error.issues[0]?.message,
    );
    return;
  }

  const handlers = getHandlersForEvent(input.eventName);
  if (handlers.length === 0) {
    // Нет подписчиков — это нормальный путь, не ошибка.
    return;
  }

  const context: AutomationContext = {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? null,
    eventId: input.eventId,
    eventName: input.eventName,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload ?? {},
    actorId: input.actorId ?? null,
  };

  for (const handler of handlers) {
    try {
      await assertPlanEntitlement(input.organizationId, "automations.run");
      await assertPlanLimit(input.organizationId, "automation_runs.monthly", 1);

      const result = await handler.run(context);

      await createAutomationLog({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
        automationName: handler.name,
        automationEvent: input.eventName,
        triggerEventId: input.eventId,
        status: result.status,
        inputPayload: context.payload,
        outputPayload: result.output ?? {},
        errorMessage: result.errorMessage ?? null,
      });
    } catch (err) {
      // Хендлер бросил вместо возврата status:'failed' — страховка.
      const message = err instanceof Error ? err.message : String(err);
      const isCommercialBlock =
        message.includes("automation_runs.monthly") ||
        message.includes("automations.run") ||
        message.includes("Upgrade to continue");
      if (isCommercialBlock) {
        await createAutomationLog({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId ?? null,
          automationName: handler.name,
          automationEvent: input.eventName,
          triggerEventId: input.eventId,
          status: "skipped",
          inputPayload: context.payload,
          errorMessage: "Automation usage limit reached. Upgrade your plan to run more automations.",
        });
        continue;
      }

      console.error(
        `[dispatchDomainEvent] handler "${handler.name}" threw:`,
        message,
      );

      await createAutomationLog({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
        automationName: handler.name,
        automationEvent: input.eventName,
        triggerEventId: input.eventId,
        status: "failed",
        inputPayload: context.payload,
        errorMessage: message,
      });
    }
  }
}
