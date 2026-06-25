/**
 * Action Center — типы фида/summary/деталей и quick actions.
 */
import type {
  ActionItem,
  ActionItemEvent,
  ActionItemLink,
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  ActionSection,
  ActionSourceType,
} from "./action-item.types";

export interface ActionFilters {
  status?: ActionItemStatus[];
  priority?: ActionItemPriority[];
  type?: ActionItemType[];
  sourceType?: ActionSourceType[];
  assignedTo?: string;
  workspaceId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

/** Карточка в фиде — item + денормализованное имя ответственного. */
export interface ActionFeedItem extends ActionItem {
  assignee_name: string | null;
  related_count: number;
}

export type ActionFeedSections = Record<ActionSection, ActionFeedItem[]>;

export interface ActionFeed {
  sections: ActionFeedSections;
  nextCursor: string | null;
}

export interface ActionSummary {
  critical: number;
  dueToday: number;
  waitingApproval: number;
  aiSuggestions: number;
  total: number;
}

/** Связанная сущность action item (гидрированная). */
export interface ActionRelatedEntity {
  link_id: string;
  entity_type: string;
  entity_id: string;
  relation_type: ActionItemLink["relation_type"];
  title: string;
  href: string | null;
}

export interface ActionDetail {
  item: ActionFeedItem;
  related: ActionRelatedEntity[];
  events: ActionItemEvent[];
  availableActions: AvailableAction[];
}

/** Виды quick action. */
export type QuickActionKind = "resolve" | "dismiss" | "snooze" | "assign" | "execute";

/** Дескриптор доступного действия для UI (permission-aware). */
export interface AvailableAction {
  kind: QuickActionKind;
  executeKind?: string;
  label: string;
  /** Опасное действие — требует явного подтверждения. */
  requiresConfirmation: boolean;
  /** Permission, нужный для выполнения. */
  permission: string;
}
