/**
 * Domain Event Types — Nevora Business OS
 *
 * Каждый модуль регистрирует свои события здесь.
 * Формат event_name: "aggregate.action"
 *
 * Порядок добавления нового события:
 *   1. Добавь имя в DomainEventName
 *   2. Добавь payload-тип в DomainEventPayloadMap
 *   3. Вызови emitDomainEvent() в Server Action после успешной операции
 */

// ── Все возможные имена событий ──────────────────────────────────────────────

import type { DomainEventName } from "./domain-event-names";
export type { DomainEventName } from "./domain-event-names";

/* export type DomainEventName =
  // Tasks
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.reopened"
  | "task.deleted"
  | "task.assigned"
  | "task.due_date_changed"
  // CRM — Clients
  | "client.created"
  | "client.updated"
  | "client.deleted"
  // CRM — Deals
  | "deal.created"
  | "deal.updated"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "deal.deleted"
  // Money
  | "payment.received"
  | "payment.sent"
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted"
  | "account.created"
  | "account.updated"
  | "account.deactivated"
  | "category.created"
  // Subscriptions
  | "subscription.created"
  | "subscription.updated"
  | "subscription.deleted"
  | "subscription.renewed"
  | "subscription.expired"
  | "subscription.plan_changed"
  | "subscription.canceled"
  // Analytics
  | "report.created"
  | "snapshot.created"
  // AI
  | "insights.generated"
  | "recommendations.generated"
  | "summary.generated"
  | "recommendation.dismissed"
  // Documents
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "document.attachment_uploaded"
  | "document.linked"
  // Organization / Core
  | "org.created"
  | "org.updated"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "member.role_changed"
  | "workspace.created"
  // Booking
  | "booking.requested"
  | "booking.request.accepted"
  | "booking.request.rejected"
  | "booking.request.canceled"
  | "booking.host_profile.created"
  | "booking.host_profile.updated"
  | "booking.service.created"
  | "booking.availability.updated"
  // CRM ← Booking
  | "crm.lead.created_from_booking"
  | "booking.request.linked_to_crm_lead"; */

// ── Aggregate types ───────────────────────────────────────────────────────────

export type AggregateType =
  | "task"
  | "client"
  | "deal"
  | "transaction"
  | "account"
  | "category"
  | "subscription"
  | "report"
  | "snapshot"
  | "ai_insight"
  | "ai_recommendation"
  | "ai_summary"
  | "document"
  | "organization"
  | "workspace"
  | "membership"
  | "booking_request"
  | "booking_host_profile"
  | "booking_service"
  | "entity_relation"
  | "action_item";

// ── Payload map — типизированный payload для каждого события ─────────────────
// Добавляй новые события сюда по мере роста модулей.

export interface DomainEventPayloadMap {
  "task.created": {
    title: string;
    priority: string;
    due_date?: string | null;
    assignee_id?: string | null;
  };
  "task.completed": {
    title: string;
    completed_at: string;
  };
  "task.reopened": {
    title: string;
  };
  "task.assigned": {
    title: string;
    assignee_id: string;
  };
  "task.updated": Record<string, unknown>;
  "task.deleted": { title: string };
  "task.due_date_changed": {
    title: string;
    old_due_date: string | null;
    new_due_date: string | null;
  };

  "client.created": { name: string; email?: string | null };
  "client.updated": Record<string, unknown>;
  "client.deleted": { name: string };

  "deal.created": { title: string; value?: number | null; currency?: string };
  "deal.stage_changed": {
    title: string;
    old_stage: string;
    new_stage: string;
  };
  "deal.won": { title: string; value?: number | null; currency?: string };
  "deal.lost": { title: string; lost_reason?: string | null };
  "deal.updated": Record<string, unknown>;
  "deal.deleted": { title: string };

  "payment.received": {
    amount: number;
    currency: string;
    account_id?: string | null;
  };
  "payment.sent": {
    amount: number;
    currency: string;
    account_id?: string | null;
  };
  "money.transaction.created": {
    amount: number;
    type: string;
    currency?: string;
    account_id?: string | null;
    category_id?: string | null;
    transaction_date?: string | null;
    // posted = фактическая, planned = запланированная (прогноз).
    status?: "posted" | "planned";
    // Опционально: транзакция оплачивает подписку → entity_link paid_by.
    subscription_id?: string;
  };
  "money.transaction.updated": {
    amount: number;
    type: string;
    account_id?: string | null;
    transaction_date?: string | null;
  };
  "transaction.deleted": { amount?: number; type?: string };
  "account.created": {
    name: string;
    currency: string;
    type?: string;
    initial_balance?: number;
  };
  "account.updated": { name: string; type: string };
  "account.deactivated": Record<string, unknown>;
  "category.created": { name: string; type: string };

  "subscription.created": {
    name: string;
    amount: number;
    currency: string;
    billing_cycle: string;
  };
  "subscription.renewed": {
    name: string;
    amount: number;
    renewed_at: string;
  };
  "subscription.expired": { name: string };
  "subscription.updated": Record<string, unknown>;
  "subscription.deleted": { name?: string };

  "report.created": { name: string; report_type: string };
  "snapshot.created": { snapshot_date: string; period_type: string };

  "insights.generated": { count: number; period_days?: number };
  "recommendations.generated": { count: number };
  "summary.generated": { entity_type: string; entity_id: string };
  "recommendation.dismissed": Record<string, unknown>;
  "subscription.plan_changed": { plan_slug: string; billing_cycle: string };
  "subscription.canceled": { at_period_end: boolean };

  "document.created": { title: string };
  "document.updated": { title: string };
  "document.deleted": { title: string };
  "document.attachment_uploaded": { filename: string; size_bytes: number };
  "document.linked": { entity_type: string; entity_id: string };

  // Document-to-Transaction Automation
  "document.extraction.started": {
    extraction_id: string;
    provider: string;
    doc_type: string;
  };
  "document.extraction.completed": {
    extraction_id: string;
    provider: string;
    confidence: number;
    created_transaction: boolean;
    transaction_id?: string | null;
  };
  "document.extraction.failed": {
    extraction_id?: string | null;
    error_code: string;
    error_message: string;
  };
  "money.transaction.draft_created": {
    amount: number;
    currency: string;
    type: string;
    merchant_name?: string | null;
    source_document_id: string;
    confidence: number;
  };
  "money.transaction.confirmed": {
    amount: number;
    type: string;
    source_document_id?: string | null;
  };
  "money.transaction.rejected": {
    source_document_id?: string | null;
    reason?: string | null;
  };
  "action_center.item_created": {
    type: string;
    source_type: string;
    source_id: string;
    priority: string;
  };

  "booking.requested": {
    client_name: string;
    service_name: string;
    host_slug: string;
    start_at: string;
    source_channel: string;
  };
  "booking.request.accepted": { booking_request_id: string; host_user_id: string };
  "booking.request.rejected": { booking_request_id: string; host_user_id: string };
  "booking.request.canceled": { booking_request_id: string };
  "booking.host_profile.created": { display_name: string; host_slug: string };
  "booking.host_profile.updated": Record<string, unknown>;
  "booking.service.created": { name: string; slug: string; duration_minutes: number };
  "booking.availability.updated": { host_slug: string };
  "crm.lead.created_from_booking": {
    name: string;
    source: string;
    booking_request_id: string;
    assigned_to_user_id: string;
  };
  "booking.request.linked_to_crm_lead": {
    booking_request_id: string;
    lead_id: string;
  };

  "org.created": { name: string; slug: string };
  "org.updated": Record<string, unknown>;
  "member.invited": { email: string; role: string };
  "member.joined": { role: string };
  "member.removed": { role: string };
  "member.role_changed": { old_role: string; new_role: string };
  "workspace.created": { name: string; type: string };

  // Cross-Module Relations (Phase 2)
  "relation.created": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
    source: "manual" | "auto";
  };
  "relation.deleted": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
  };
  "relation.updated": Record<string, unknown>;
  "relation.auto_created": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
    source: "auto";
    confidence: number;
    matched_by: string[];
  };
  "relation.suggested": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
    confidence: number;
  };

  // Action Center (Phase 3)
  "action_item.created": {
    type: string;
    source_type: string;
    source_id: string;
    priority: string;
    ai_generated: boolean;
  };
  "action_item.assigned": { assigned_to: string };
  "action_item.snoozed": { snoozed_until: string };
  "action_item.resolved": { type: string; source_type: string };
  "action_item.dismissed": { type: string; source_type: string };
  "action_item.executed": { action: string; confirmed: boolean };
  "action_item.failed": { action: string; error: string };
}

// ── Базовый тип записи domain_event из БД ────────────────────────────────────

export interface DomainEvent<T extends DomainEventName = DomainEventName> {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  event_name: T;
  aggregate_type: AggregateType;
  aggregate_id: string;
  payload: DomainEventPayloadMap[T];
  created_by: string;
  version: number;
  created_at: string;
}

// ── Параметры для emitDomainEvent() ──────────────────────────────────────────

export interface EmitDomainEventParams<T extends DomainEventName> {
  organizationId: string;
  workspaceId?: string;
  eventName: T;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: DomainEventPayloadMap[T];
}
