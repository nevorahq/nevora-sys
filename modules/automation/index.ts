/**
 * Automation module — public surface.
 *
 * Движок автоматизаций Phase 1: registry + dispatch + audit logs.
 * Хендлеры регистрируются в engine/automation-registry.ts.
 */

export { dispatchDomainEvent } from "./engine/dispatch-domain-event";
export type { DispatchDomainEventInput } from "./engine/dispatch-domain-event";
export {
  AUTOMATION_HANDLERS,
  getHandlersForEvent,
} from "./engine/automation-registry";
export type {
  AutomationHandler,
  AutomationContext,
  AutomationResult,
} from "./engine/automation-handler.types";

export { getAutomationLogs } from "./logs/get-automation-logs";
export type {
  AutomationLog,
  GetAutomationLogsInput,
} from "./logs/get-automation-logs";
export {
  AUTOMATION_LOG_STATUSES,
  type AutomationLogStatus,
} from "./logs/automation-log.schema";
