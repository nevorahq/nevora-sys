/**
 * Automation Handler Contract.
 *
 * Хендлер — это единица автоматизации, реагирующая на одно domain-событие.
 * Регистрируется в automation-registry и запускается dispatchDomainEvent().
 *
 * Правила:
 *   • Хендлер НЕ должен бросать наружу — ошибка ловится движком и пишется
 *     в automation_audit_logs(status='failed'). Но если бросит — движок
 *     всё равно поймает (try/catch), это лишь страховка, не основной путь.
 *   • Хендлер возвращает status: executed | failed | skipped.
 *   • Хендлер работает под RLS от имени пользователя (через те же серверные
 *     сервисы), service role не используется.
 */

import type {
  DomainEventName,
  AggregateType,
} from "@/lib/events/domain-event.types";

/** Контекст, передаваемый хендлеру при срабатывании события. */
export interface AutomationContext {
  organizationId: string;
  workspaceId?: string | null;
  eventId: string;
  eventName: DomainEventName;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: Record<string, unknown>;
  actorId?: string | null;
}

/** Результат выполнения хендлера. */
export interface AutomationResult {
  status: "executed" | "failed" | "skipped";
  output?: Record<string, unknown>;
  errorMessage?: string;
}

/** Сам хендлер. */
export interface AutomationHandler {
  /** Уникальное имя автоматизации (попадает в automation_audit_logs.automation_name). */
  name: string;
  /** Имя domain-события, на которое подписан хендлер. */
  eventName: DomainEventName;
  /** Бизнес-логика автоматизации. */
  run: (context: AutomationContext) => Promise<AutomationResult>;
}
