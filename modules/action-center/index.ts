/**
 * modules/action-center — Action Center (Phase 3).
 *
 * Orchestration-слой поверх модулей: нормализует сигналы в action_items,
 * приоритизирует и показывает на одном экране. Публичный API — серверная
 * композиция страницы. Actions/queries/services внутренние (импортируются
 * напрямую клиентскими компонентами / app-роутом по необходимости).
 */
export { ActionCenterPage } from "./components/action-center-page";

export type {
  ActionItem,
  ActionItemType,
  ActionItemStatus,
  ActionItemPriority,
  ActionSourceType,
} from "./types/action-item.types";
export type {
  ActionFeed,
  ActionSummary,
  ActionDetail,
  ActionFilters,
} from "./types/action-center.types";
