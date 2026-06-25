import type { EntityLinkType } from "@/lib/entity-links";
import { ROUTES } from "@/shared/config/routes";

/**
 * Phase 2 MVP поддерживает связи между 4 бизнес-сущностями.
 * Это подмножество полиморфных типов entity_links — client/deal остаются
 * за другими фичами, но не доступны для ручного связывания в UI relations.
 */
export const RELATION_ENTITY_KINDS = [
  "task",
  "document",
  "transaction",
  "subscription",
] as const;

export type EntityKind = (typeof RELATION_ENTITY_KINDS)[number];

export function isEntityKind(value: string): value is EntityKind {
  return (RELATION_ENTITY_KINDS as readonly string[]).includes(value);
}

/** Человекочитаемые имена групп (UI). */
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  task: "Tasks",
  document: "Documents",
  transaction: "Money",
  subscription: "Subscriptions",
};

export const ENTITY_KIND_SINGULAR: Record<EntityKind, string> = {
  task: "Task",
  document: "Document",
  transaction: "Transaction",
  subscription: "Subscription",
};

/** Полиморфный type → физическая таблица (tenant-safe hydration/search). */
export const ENTITY_KIND_TABLE: Record<EntityKind, string> = {
  task: "todos",
  document: "documents",
  transaction: "money_transactions",
  subscription: "subscriptions",
};

/** Куда вести по клику на связанную сущность. */
export const ENTITY_KIND_ROUTE: Record<EntityKind, (id: string) => string> = {
  task: (id) => `${ROUTES.tasks}/${id}`,
  document: (id) => `${ROUTES.documents}/${id}`,
  transaction: (id) => `${ROUTES.money}/${id}`,
  subscription: (id) => `${ROUTES.subscriptions}/${id}`,
};

/** Типы связей, доступные пользователю при ручном связывании. */
export const MANUAL_RELATION_TYPES: EntityLinkType[] = [
  "related_to",
  "attached_to",
  "documented_by",
  "paid_by",
  "belongs_to_subscription",
  "invoice_for_transaction",
  "contract_for_subscription",
  "renewal_task",
  "requires_action_task",
];

/** Подписи всех типов связей (включая legacy 040 для отображения). */
export const RELATION_TYPE_LABELS: Record<EntityLinkType, string> = {
  related: "Related",
  generated_from: "Generated from",
  attached_to: "Attached to",
  paid_by: "Paid by",
  renewed_by: "Renewed by",
  requires_action: "Requires action",
  belongs_to: "Belongs to",
  related_to: "Related to",
  documented_by: "Documented by",
  requires_action_task: "Requires action",
  belongs_to_subscription: "Belongs to subscription",
  invoice_for_transaction: "Invoice for transaction",
  contract_for_subscription: "Contract for subscription",
  renewal_task: "Renewal task",
};
