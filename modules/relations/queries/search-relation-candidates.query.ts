import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RELATION_ENTITY_CONFIG } from "../constants/relation.constants";
import type { EntityKind, RelationCandidate } from "../types/relation.types";

/**
 * Tenant-safe поиск сущностей, которые можно привязать.
 *
 * Каждый вид ищется в своей таблице, всегда scope по organization_id +
 * RLS. Поисковая строка экранируется (escapeIlike) перед ilike, чтобы
 * %/_/, не ломали запрос и не превращались в инъекцию шаблона.
 */
export async function searchCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  targetTypes: EntityKind[],
  query: string,
  limit: number,
  excludeId?: string,
): Promise<RelationCandidate[]> {
  const term = escapeIlike(query.trim());
  const pattern = term ? `%${term}%` : "%";

  const results = await Promise.all(
    targetTypes.map((type) =>
      searchOne(supabase, organizationId, type, pattern, limit, excludeId),
    ),
  );

  return results.flat();
}

function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function searchOne(
  supabase: SupabaseClient,
  organizationId: string,
  type: EntityKind,
  pattern: string,
  limit: number,
  excludeId?: string,
): Promise<RelationCandidate[]> {
  if (type === "task") {
    let q = supabase
      .from(RELATION_ENTITY_CONFIG.task.table)
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    return (data ?? []).map((r) => ({
      type: "task" as const,
      id: r.id as string,
      title: (r.title as string) || "Untitled task",
      subtitle: (r.status as string | null) ?? null,
    }));
  }

  if (type === "document") {
    let q = supabase
      .from(RELATION_ENTITY_CONFIG.document.table)
      .select("id, title, doc_type")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    return (data ?? []).map((r) => ({
      type: "document" as const,
      id: r.id as string,
      title: (r.title as string) || "Untitled document",
      subtitle: (r.doc_type as string | null) ?? null,
    }));
  }

  if (type === "transaction") {
    let q = supabase
      .from(RELATION_ENTITY_CONFIG.transaction.table)
      .select("id, title, amount, currency, transaction_date")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    return (data ?? []).map((r) => ({
      type: "transaction" as const,
      id: r.id as string,
      title: (r.title as string) || "Transaction",
      subtitle: formatAmount(r.amount, r.currency, r.transaction_date as string | null),
    }));
  }

  // subscription
  let q = supabase
    .from(RELATION_ENTITY_CONFIG.subscription.table)
    .select("id, name, amount, currency, next_billing_date")
    .eq("organization_id", organizationId)
    .ilike("name", pattern)
    .order("next_billing_date", { ascending: true })
    .limit(limit);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    type: "subscription" as const,
    id: r.id as string,
    title: (r.name as string) || "Subscription",
    subtitle: formatAmount(r.amount, r.currency, r.next_billing_date as string | null),
  }));
}

function formatAmount(
  amount: unknown,
  currency: unknown,
  date: string | null,
): string | null {
  const parts: string[] = [];
  if (typeof amount === "number") {
    parts.push(`${typeof currency === "string" ? currency : ""}${amount}`.trim());
  }
  if (date) parts.push(date);
  return parts.length ? parts.join(" · ") : null;
}
