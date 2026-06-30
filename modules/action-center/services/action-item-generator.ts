import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { computePriority } from "./priority-engine";
import type {
  ActionItemType,
  ActionSourceType,
} from "../types/action-item.types";

/**
 * Action Item Generator (Phase 3 §14).
 *
 * Сканирует модули и НОРМАЛИЗУЕТ сигналы в action_items. Идемпотентно:
 * один активный item на (org, type, source_type, source_id) — гарантируется
 * unique-индексом 048 + предварительной проверкой существующих ключей.
 *
 * MVP-стратегия: запускается на загрузке фида (cheap, selected-column scans,
 * лимиты). Production-путь — event-handlers + cron (см. README/Remaining Risks).
 *
 * НЕ дублирует бизнес-логику модулей: только читает их данные и создаёт item'ы.
 */

const SCAN_LIMIT = 200;

interface Candidate {
  title: string;
  description?: string;
  type: ActionItemType;
  sourceType: ActionSourceType;
  sourceId: string;
  primaryEntityType: string;
  primaryEntityId: string;
  dueAt?: string;
  financialImpact?: number;
  missingRelation?: boolean;
  aiGenerated?: boolean;
  aiConfidence?: number;
  aiReason?: string;
  metadata?: Record<string, unknown>;
}

function dedupeKey(type: string, sourceType: string, sourceId: string): string {
  return `${type}:${sourceType}:${sourceId}`;
}

export async function syncActionItems(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<{ created: number }> {
  const orgId = ctx.org.id;

  // Существующие активные ключи (любой статус, пока deleted_at IS NULL).
  const { data: existing } = await supabase
    .from("action_items")
    .select("type, source_type, source_id")
    .eq("organization_id", orgId);

  const existingKeys = new Set(
    (existing ?? []).map((r) => dedupeKey(r.type as string, r.source_type as string, r.source_id as string)),
  );

  const candidates: Candidate[] = [];
  await Promise.all([
    detectTasks(supabase, orgId, candidates),
    detectSubscriptions(supabase, orgId, candidates),
    detectTransactions(supabase, orgId, candidates),
    detectDocuments(supabase, orgId, candidates),
    detectDeals(supabase, orgId, candidates),
  ]);

  const fresh = candidates.filter((c) => !existingKeys.has(dedupeKey(c.type, c.sourceType, c.sourceId)));
  if (fresh.length === 0) return { created: 0 };

  const rows = fresh.map((c) => {
    const { score, priority } = computePriority({
      type: c.type,
      sourceType: c.sourceType,
      dueAt: c.dueAt ?? null,
      financialImpact: c.financialImpact ?? null,
      aiConfidence: c.aiConfidence ?? null,
      missingRelation: c.missingRelation ?? false,
    });
    return {
      organization_id: orgId,
      workspace_id: ctx.workspace.id,
      title: c.title,
      description: c.description ?? null,
      type: c.type,
      status: "open",
      priority,
      priority_score: score,
      source_type: c.sourceType,
      source_id: c.sourceId,
      primary_entity_type: c.primaryEntityType,
      primary_entity_id: c.primaryEntityId,
      due_at: c.dueAt ?? null,
      ai_generated: c.aiGenerated ?? false,
      ai_confidence: c.aiConfidence ?? null,
      ai_reason: c.aiReason ?? null,
      metadata: c.metadata ?? {},
      created_by: ctx.user.id,
    };
  });

  // Insert + ignore гонок (23505 на dedupe-индексе). select id для links.
  const { data: inserted, error } = await supabase
    .from("action_items")
    .insert(rows)
    .select("id, type, source_type, source_id");

  if (error) {
    if (error.code === "23505") return { created: 0 }; // гонка генерации — ок
    console.error("[syncActionItems] insert failed:", error.message);
    return { created: 0 };
  }

  // primary-link на исходную сущность для каждого нового item.
  const byKey = new Map(
    (inserted ?? []).map((r) => [dedupeKey(r.type as string, r.source_type as string, r.source_id as string), r.id as string]),
  );
  const links = fresh
    .map((c) => {
      const id = byKey.get(dedupeKey(c.type, c.sourceType, c.sourceId));
      if (!id) return null;
      return {
        organization_id: orgId,
        workspace_id: ctx.workspace.id,
        action_item_id: id,
        entity_type: c.primaryEntityType,
        entity_id: c.primaryEntityId,
        relation_type: "primary" as const,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (links.length > 0) {
    await supabase.from("action_item_links").insert(links);
  }

  return { created: inserted?.length ?? 0 };
}

// ── Detectors ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function detectTasks(supabase: SupabaseClient, orgId: string, out: Candidate[]): Promise<void> {
  const { data: tasks } = await supabase
    .from("todos")
    .select("id, title, due_date, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("status", ["todo", "in_progress"])
    .limit(SCAN_LIMIT);
  if (!tasks?.length) return;

  // Назначения: какие задачи имеют ответственного.
  const ids = tasks.map((t) => t.id as string);
  const { data: assignees } = await supabase
    .from("task_assignees")
    .select("task_id")
    .in("task_id", ids);
  const assignedTaskIds = new Set((assignees ?? []).map((a) => a.task_id as string));

  const today = todayISO();
  const soon = plusDaysISO(3);

  for (const t of tasks) {
    const id = t.id as string;
    const due = t.due_date as string | null;
    const title = (t.title as string) || "Task";
    const dueAt = due ? `${due}T00:00:00.000Z` : undefined;

    if (due && due < today) {
      out.push({ title: `Overdue task: ${title}`, type: "overdue", sourceType: "task", sourceId: id, primaryEntityType: "task", primaryEntityId: id, dueAt });
    } else if (due && due <= soon) {
      out.push({ title: `Task due soon: ${title}`, type: "due_soon", sourceType: "task", sourceId: id, primaryEntityType: "task", primaryEntityId: id, dueAt });
    }

    if (!assignedTaskIds.has(id)) {
      out.push({ title: `Task needs an assignee: ${title}`, type: "assignment_required", sourceType: "task", sourceId: id, primaryEntityType: "task", primaryEntityId: id });
    }
  }
}

async function detectSubscriptions(supabase: SupabaseClient, orgId: string, out: Candidate[]): Promise<void> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, name, amount, next_billing_date, is_active")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .limit(SCAN_LIMIT);
  if (!subs?.length) return;

  // Связи подписок: есть ли контракт (document) и есть ли оплата (transaction).
  const { data: links } = await supabase
    .from("entity_links")
    .select("source_type, source_id, target_type, target_id, link_type")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or("source_type.eq.subscription,target_type.eq.subscription");

  const hasContract = new Set<string>();
  const hasPayment = new Set<string>();
  for (const l of links ?? []) {
    const subId =
      l.source_type === "subscription" ? (l.source_id as string)
      : l.target_type === "subscription" ? (l.target_id as string)
      : null;
    if (!subId) continue;
    const otherIsDocument = l.source_type === "document" || l.target_type === "document";
    const otherIsTransaction = l.source_type === "transaction" || l.target_type === "transaction";
    if (otherIsDocument || l.link_type === "contract_for_subscription" || l.link_type === "attached_to") hasContract.add(subId);
    if (otherIsTransaction || l.link_type === "paid_by") hasPayment.add(subId);
  }

  const soon = plusDaysISO(7);
  const today = todayISO();

  for (const s of subs) {
    const id = s.id as string;
    const name = (s.name as string) || "Subscription";
    const next = s.next_billing_date as string | null;
    const amount = typeof s.amount === "number" ? s.amount : Number(s.amount) || 0;

    if (next && next >= today && next <= soon) {
      out.push({ title: `Subscription renews soon: ${name}`, type: "renewal_required", sourceType: "subscription", sourceId: id, primaryEntityType: "subscription", primaryEntityId: id, dueAt: `${next}T00:00:00.000Z`, financialImpact: amount });
    }

    if (!hasContract.has(id)) {
      out.push({ title: `Subscription has no contract: ${name}`, type: "missing_relation", sourceType: "subscription", sourceId: id, primaryEntityType: "subscription", primaryEntityId: id, missingRelation: true, financialImpact: amount });
    }

    // AI suggestion: возможно неиспользуемая подписка (нет недавних оплат).
    if (!hasPayment.has(id) && amount > 0) {
      out.push({
        title: `Review possibly unused subscription: ${name}`,
        description: `No linked payments found for ${name}. Consider reviewing usage before the next renewal.`,
        type: "ai_suggestion",
        sourceType: "ai",
        sourceId: id,
        primaryEntityType: "subscription",
        primaryEntityId: id,
        financialImpact: amount,
        aiGenerated: true,
        aiConfidence: 0.72,
        aiReason: "Subscription has no linked transactions, which may indicate it is unused.",
      });
    }
  }
}

async function detectTransactions(supabase: SupabaseClient, orgId: string, out: Candidate[]): Promise<void> {
  const { data: txs } = await supabase
    .from("money_transactions")
    .select("id, title, amount, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .limit(SCAN_LIMIT);
  if (!txs?.length) return;

  const { data: links } = await supabase
    .from("entity_links")
    .select("source_type, source_id, target_type, target_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or("source_type.eq.transaction,target_type.eq.transaction");

  const hasDocument = new Set<string>();
  for (const l of links ?? []) {
    const txId =
      l.source_type === "transaction" ? (l.source_id as string)
      : l.target_type === "transaction" ? (l.target_id as string)
      : null;
    if (!txId) continue;
    if (l.source_type === "document" || l.target_type === "document") hasDocument.add(txId);
  }

  for (const t of txs) {
    const id = t.id as string;
    const title = (t.title as string) || "Transaction";
    const amount = typeof t.amount === "number" ? t.amount : Number(t.amount) || 0;

    if (t.status === "planned") {
      out.push({ title: `Confirm transaction draft: ${title}`, type: "draft_review", sourceType: "transaction", sourceId: id, primaryEntityType: "transaction", primaryEntityId: id, financialImpact: amount });
    }
    if (!hasDocument.has(id)) {
      out.push({ title: `Transaction has no document: ${title}`, type: "missing_relation", sourceType: "transaction", sourceId: id, primaryEntityType: "transaction", primaryEntityId: id, missingRelation: true, financialImpact: amount });
    }
  }
}

async function detectDocuments(supabase: SupabaseClient, orgId: string, out: Candidate[]): Promise<void> {
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("status", "draft")
    .limit(SCAN_LIMIT);
  if (!docs?.length) return;

  for (const d of docs) {
    const id = d.id as string;
    out.push({ title: `Document needs review: ${(d.title as string) || "Document"}`, type: "document_review", sourceType: "document", sourceId: id, primaryEntityType: "document", primaryEntityId: id });
  }
}

async function detectDeals(supabase: SupabaseClient, orgId: string, out: Candidate[]): Promise<void> {
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, title, status, expected_close_date")
    .eq("organization_id", orgId)
    .eq("status", "open")
    .limit(SCAN_LIMIT);
  if (!deals?.length) return;

  const ids = deals.map((d) => d.id as string);
  const nowISO = new Date().toISOString();
  const { data: activities } = await supabase
    .from("crm_activities")
    .select("entity_id")
    .eq("organization_id", orgId)
    .eq("entity_type", "deal")
    .eq("completed", false)
    .gte("scheduled_at", nowISO)
    .in("entity_id", ids);
  const dealsWithUpcoming = new Set((activities ?? []).map((a) => a.entity_id as string));

  for (const d of deals) {
    const id = d.id as string;
    if (!dealsWithUpcoming.has(id)) {
      const close = d.expected_close_date as string | null;
      out.push({
        title: `Deal needs next activity: ${(d.title as string) || "Deal"}`,
        type: "follow_up_required",
        sourceType: "crm",
        sourceId: id,
        primaryEntityType: "deal",
        primaryEntityId: id,
        dueAt: close ? `${close}T00:00:00.000Z` : undefined,
      });
    }
  }
}
