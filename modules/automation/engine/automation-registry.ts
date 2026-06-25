/**
 * Automation Registry.
 *
 * Единый реестр всех automation-хендлеров. dispatchDomainEvent() спрашивает
 * у реестра список хендлеров, подписанных на конкретное событие.
 *
 * Регистрация статическая (массив на этапе сборки) — без runtime-конфигурации
 * пользователем. User-configurable правила — за рамками Phase 1.
 *
 * Добавление нового хендлера:
 *   1. Создай файл в modules/automation/handlers/on-*.ts
 *   2. Импортируй его сюда и добавь в AUTOMATION_HANDLERS
 */

import type { DomainEventName } from "@/lib/events/domain-event.types";
import type { AutomationHandler } from "./automation-handler.types";

import { onTaskCreated } from "../handlers/on-task-created";
import { onDocumentCreated } from "../handlers/on-document-created";
import { onTransactionCreated } from "../handlers/on-transaction-created";
import { onSubscriptionRenewed } from "../handlers/on-subscription-renewed";

/** Все зарегистрированные хендлеры. Порядок = порядок выполнения. */
export const AUTOMATION_HANDLERS: readonly AutomationHandler[] = [
  onTaskCreated,
  onDocumentCreated,
  onTransactionCreated,
  onSubscriptionRenewed,
];

/** Вернуть хендлеры, подписанные на данное событие. */
export function getHandlersForEvent(
  eventName: DomainEventName,
): AutomationHandler[] {
  return AUTOMATION_HANDLERS.filter((h) => h.eventName === eventName);
}
