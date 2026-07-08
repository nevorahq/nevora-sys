import type { EntityLinkType } from "@/lib/entity-links";
import { ROUTES } from "@/shared/config/routes";

/**
 * Active relation scope covers four business entities only:
 * Tasks, Money (transaction), Documents and Subscriptions.
 *
 * CRM / Leads / Clients / Deals remain paused and out of scope. Paused modules
 * must not be added here until explicitly reactivated by product decision —
 * the resolver, hydration and verification all derive from this one config, so
 * everything downstream stays active-module-only and fails closed otherwise.
 */
export const RELATION_ENTITY_KINDS = [
  "task",
  "document",
  "transaction",
  "subscription",
] as const;

export type EntityKind = (typeof RELATION_ENTITY_KINDS)[number];

/** Single source of truth for active-module relation metadata. */
export interface RelationEntityMeta {
  /** Physical Postgres table (tenant-safe hydration/search/verification). */
  table: string;
  /** Singular display label. */
  label: string;
  /** Plural group label used in the relation viewer headers. */
  pluralLabel: string;
  /** Base route; detail href is `${route}/${id}`. */
  route: string;
}

export const RELATION_ENTITY_CONFIG: Record<EntityKind, RelationEntityMeta> = {
  task: { table: "todos", label: "Task", pluralLabel: "Tasks", route: ROUTES.tasks },
  document: { table: "documents", label: "Document", pluralLabel: "Documents", route: ROUTES.documents },
  transaction: { table: "money_transactions", label: "Transaction", pluralLabel: "Money", route: ROUTES.money },
  subscription: { table: "subscriptions", label: "Subscription", pluralLabel: "Subscriptions", route: ROUTES.subscriptions },
};

export function isEntityKind(value: string): value is EntityKind {
  return Object.prototype.hasOwnProperty.call(RELATION_ENTITY_CONFIG, value);
}

const CONFIG_ENTRIES = Object.entries(RELATION_ENTITY_CONFIG) as [EntityKind, RelationEntityMeta][];

function mapFromConfig<K extends keyof RelationEntityMeta>(key: K): Record<EntityKind, RelationEntityMeta[K]> {
  return Object.fromEntries(CONFIG_ENTRIES.map(([kind, meta]) => [kind, meta[key]])) as Record<
    EntityKind,
    RelationEntityMeta[K]
  >;
}

/** Человекочитаемые имена групп (UI) — derived from RELATION_ENTITY_CONFIG. */
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = mapFromConfig("pluralLabel");

export const ENTITY_KIND_SINGULAR: Record<EntityKind, string> = mapFromConfig("label");

/** Полиморфный type → физическая таблица (tenant-safe hydration/search). */
export const ENTITY_KIND_TABLE: Record<EntityKind, string> = mapFromConfig("table");

/** Куда вести по клику на связанную сущность. */
export const ENTITY_KIND_ROUTE: Record<EntityKind, (id: string) => string> = Object.fromEntries(
  CONFIG_ENTRIES.map(([kind, meta]) => [kind, (id: string) => `${meta.route}/${id}`]),
) as Record<EntityKind, (id: string) => string>;

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
  "evidence_for",
  "created_from",
  "suggested_for",
  "confirmed_as",
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
  evidence_for: "Evidence for",
  created_from: "Created from",
  suggested_for: "Suggested for",
  confirmed_as: "Confirmed as",
};
