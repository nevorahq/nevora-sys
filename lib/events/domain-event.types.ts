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
  | "subscription_payment_cycle"
  | "financial_suggestion"
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
  | "action_item"
  | "project"
  | "money_ai_suggestion"
  | "money_category_rule"
  | "planner_entry"
  | "planner_suggestion"
  | "onboarding_progress"
  | "user_account";

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
  "task.unassigned": {
    title: string;
    assignee_id: string;
  };
  "task.updated": Record<string, unknown>;
  "task.deleted": { title: string };
  "task.due_date_changed": {
    title: string;
    old_due_date: string | null;
    new_due_date: string | null;
    // Classified server-side: set | extended | shortened | changed | removed.
    change_type?: string;
    reason?: string | null;
  };

  // Projects (Tasks module)
  "project.created": { name: string; slug: string; status: string; priority: string };
  "project.updated": Record<string, unknown>;
  "project.archived": { name: string };
  "project.completed": { name: string; completed_at: string };
  "project.progress_updated": { progress: number };
  "task.assigned_to_project": { task_id: string; project_id: string; title: string };
  "task.removed_from_project": { task_id: string; project_id: string; title: string };
  "task.created_from_subscription": Record<string, unknown>;

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
  "money.transfer.created": {
    amount: number;
    currency: string;
    from_account_id: string;
    to_account_id: string;
    transaction_date?: string | null;
  };
  "transaction.deleted": { amount?: number; type?: string };

  // Money Intelligence (Phase 5, migration 069)
  "money.transaction.categorization_requested": {
    transaction_id: string;
    type: string;
  };
  "money.transaction.categorized": {
    transaction_id: string;
    category_id: string | null;
    category_source: string;
    confidence?: number;
  };
  "money.transaction.category_changed": {
    transaction_id: string;
    category_id: string | null;
    category_source: string | null;
  };
  "money.ai_suggestion.created": {
    transaction_id: string;
    suggested_category_id: string | null;
    source: string;
    confidence: number;
  };
  "money.ai_suggestion.accepted": {
    transaction_id: string;
    category_id: string;
    source: string;
    confidence: number;
    edited: boolean;
  };
  "money.ai_suggestion.rejected": {
    transaction_id: string;
    source: string;
  };
  "money.category_rule.created": {
    rule_id: string | null;
    merchant: string;
    category_id: string;
    scope?: string;
  };
  "money.category_rule.updated": {
    rule_id: string;
    scope: string;
    category_id: string | null;
  };
  "money.category_rule.disabled": { rule_id: string; scope: string };
  "money.category_rule.enabled": { rule_id: string; scope: string };
  "money.category_rule.deleted": { rule_id: string; scope: string };
  "money.ai_suggestion.expired": {
    transaction_id: string;
    source: string;
  };
  "money.transaction.auto_categorization_requested": {
    transaction_id: string;
    type: string;
  };
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
  "subscription.cancelled": {
    name: string;
    cancelled_at: string;
    open_cycles_cancelled: number;
    open_tasks_cancelled: number;
  };

  // Subscription Payment Workflow (migration 078)
  "subscription.payment_cycle.created": {
    subscription_id: string;
    cycle_id: string;
    billing_period_key: string;
    due_date: string;
    expected_amount: number;
    currency: string;
  };
  "subscription.payment_cycle.paid": {
    subscription_id: string;
    cycle_id: string;
    billing_period_key: string;
    transaction_id: string;
    amount: number;
    currency: string;
    paid_at: string;
  };
  "subscription.payment_cycle.skipped": {
    subscription_id: string;
    cycle_id: string;
    billing_period_key: string;
  };
  "subscription.payment_due_date.changed": {
    subscription_id: string;
    cycle_id: string;
    old_due_date: string;
    new_due_date: string;
  };
  "subscription.payment_task.created": {
    subscription_id: string;
    cycle_id: string;
    task_id: string;
    billing_period_key: string;
    due_date: string;
  };
  "subscription_task_suggestion.created": Record<string, unknown>;
  "subscription_task_suggestion.confirmed": Record<string, unknown>;

  "report.created": { name: string; report_type: string };
  "snapshot.created": { snapshot_date: string; period_type: string };

  "insights.generated": { count: number; period_days?: number };
  "recommendations.generated": { count: number };
  "summary.generated": { entity_type: string; entity_id: string };
  "recommendation.dismissed": Record<string, unknown>;
  "subscription.plan_changed": { plan_slug: string; billing_cycle: string };
  "subscription.canceled": { at_period_end: boolean };
  "billing.subscription.created": Record<string, unknown>;
  "billing.subscription.updated": Record<string, unknown>;
  "billing.subscription.canceled": { at_period_end?: boolean; provider?: string };
  "billing.plan.changed": { old_plan_code?: string; new_plan_code: string };
  "billing.payment.succeeded": { amount?: number; currency?: string; provider?: string };
  "billing.payment.failed": { amount?: number; currency?: string; provider?: string; reason?: string };
  "billing.limit.exceeded": {
    key: string;
    current_usage: number;
    limit: number | null;
    plan_code: string;
  };
  "billing.trial.expired": { trial_end: string };
  // Trial Reuse Protection (migration 086). Payload минимальный и без raw
  // email — identity живёт в billing_trial_claims (hash), не в событиях.
  "billing.trial.claimed": {
    organization_id: string | null;
    user_id: string;
    plan?: "trial";
    trial_started_at?: string;
    trial_ended_at?: string;
  };
  "billing.trial.denied": {
    organization_id: string | null;
    user_id: string;
    reason?: string;
  };
  "billing.trial.consumed": {
    organization_id: string | null;
    user_id: string;
    trial_ended_at?: string;
  };
  "billing.plan.required": {
    organization_id: string | null;
    user_id: string;
    reason?: string;
  };
  pricing_viewed: Record<string, unknown>;
  checkout_started: {
    plan_slug: string;
    billing_cycle: string;
    provider?: string | null;
  };
  checkout_completed: Record<string, unknown>;
  checkout_failed: Record<string, unknown>;
  customer_portal_opened: { provider?: string | null };
  upgrade_prompt_viewed: {
    metric_key?: string;
    feature_key?: string;
    current_usage?: number;
    limit?: number | null;
  };
  upgrade_prompt_clicked: {
    metric_key?: string;
    feature_key?: string;
    target_plan_slug?: string;
  };
  limit_reached: {
    key: string;
    current_usage: number;
    limit: number | null;
    plan_code: string;
  };
  trial_started: { trial_end?: string | null };
  trial_expired: { trial_end?: string | null };
  trial_reuse_blocked: { reason?: string };
  subscription_cancelled: Record<string, unknown>;
  subscription_updated: Record<string, unknown>;

  "document.created": {
    title: string;
    source?: "subscription" | "dashboard" | string;
    skip_money_sync?: boolean;
  };
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
    suggestion_id?: string | null;
  };
  "document.extraction.failed": {
    extraction_id?: string | null;
    error_code: string;
    error_message: string;
  };
  // ── Financial Context Tasks (migration 079) ────────────────────────────────
  "document.financial_data_extracted": {
    context_type: string;
    recurring: boolean;
    provider_name?: string | null;
    financial_due_date?: string | null;
    amount?: number | null;
    currency?: string | null;
    confidence: number;
  };
  "document.detected_financial_data": Record<string, unknown>;
  "financial_obligation.detected": {
    context_type: string;
    confidence: number;
  };
  "financial_obligation.confirmed": {
    context_type: string;
    task_id?: string | null;
  };
  "financial_obligation.dismissed": {
    source_type?: string | null;
    source_document_id?: string | null;
    reason?: string | null;
  };
  "financial_obligation.task_created": {
    document_id: string;
    context_type: string;
  };
  "financial_obligation.paid": {
    task_id: string;
    transaction_id?: string | null;
  };
  "financial_obligation.skipped": {
    source_type?: string | null;
    source_document_id?: string | null;
    reason?: string | null;
  };
  "financial_task.created": {
    context_type: string;
    provider_name?: string | null;
    amount?: number | null;
    currency?: string | null;
    financial_due_date: string;
    reminder_offset_days: number;
    action_due_date?: string | null;
    source_type?: string | null;
    source_id?: string | null;
    source_document_id?: string | null;
  };
  "financial_task.completed": {
    transaction_id?: string | null;
    paid_at: string;
  };
  "financial_task.amount_set": {
    amount: number;
    currency: string;
    previous_amount?: number | null;
    previous_currency?: string | null;
  };
  "financial_task.skipped": {
    reason?: string | null;
    resolved_at: string;
  };
  "financial_task.dismissed": {
    reason?: string | null;
    resolved_at: string;
  };
  "financial_task.due_date_changed": {
    old_financial_due_date?: string | null;
    new_financial_due_date: string;
    old_action_due_date?: string | null;
    new_action_due_date?: string | null;
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
    category_id?: string | null;
    expense_context_id?: string | null;
  };
  "money.transaction.rejected": {
    source_document_id?: string | null;
    reason?: string | null;
  };
  "transaction.created_from_suggestion": Record<string, unknown>;
  "financial_suggestion.created": Record<string, unknown>;
  "financial_suggestion.edited": Record<string, unknown>;
  "financial_suggestion.confirmed": Record<string, unknown>;
  "financial_suggestion.rejected": Record<string, unknown>;
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
    source: "manual" | "auto" | "user" | "system" | "ai";
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
    source: "auto" | "system" | "ai";
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
  "relation.confirmed": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
    relation_id: string;
    previous_state: string;
    next_state: string;
  };
  "relation.rejected": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
    relation_id: string;
    previous_state: string;
    next_state: string;
  };
  "relation.unlinked": {
    source_entity_type: string;
    source_entity_id: string;
    target_entity_type: string;
    target_entity_id: string;
    relation_type: string;
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
  "action_item.restored": { type: string; source_type: string; record_restored: boolean };

  // Capture Inbox (Phase 8) — the thin input layer. Payloads stay minimal.
  "planner_entry.created": { entry_type: string; source: string };
  "planner_entry.processing_started": Record<string, never>;
  "planner_entry.processed": {
    detected_intent: string;
    suggestion_count: number;
    top_confidence: number;
    band: string;
  };
  "planner_entry.failed": { reason: string };
  "planner_suggestion.created": {
    planner_entry_id: string;
    suggestion_type: string;
    confidence: number;
  };
  "planner_suggestion.accepted": {
    suggestion_type: string;
    entity_type: string;
    entity_id: string;
  };
  "planner_suggestion.edited": { suggestion_type: string };
  "planner_suggestion.rejected": { reason: string | null };
  "planner_suggestion.failed": { reason: string };
  /**
   * Written by the daily sweep's TTL pass. The orphan pass runs inside
   * expire_orphaned_planner_suggestions (migration 094) and emits nothing — it is
   * a SQL-side reconciliation, not a user-visible event.
   */
  "planner_suggestion.expired": { reason: "ttl"; suggestion_type: string };

  // ── Onboarding funnel (Phase B / B2 + B7) ──────────────────────────────────
  /** `source` discriminates the wizard tile from an empty-state CTA (B7 metric 5). */
  "onboarding.first_action_selected": { first_action: string; source: string };
  "onboarding.first_action_completed": { first_action: string | null; draft_id: string | null };
  "onboarding.first_workflow_completed": {
    first_action: string | null;
    /** The Phase B activation metric: time from first dashboard visit to confirm. */
    seconds_to_activation: number;
  };
  "onboarding.dismissed": { step: string };
  "user.deletion_requested": { graceDays: number; soloOrganizations: number };
  "user.deletion_cancelled": Record<string, never>;
  "user.deletion_purged": Record<string, never>;
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
