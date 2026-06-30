import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTITY_LINK_COLUMNS, type EntityLink } from "@/lib/entity-links";
import {
  ENTITY_KIND_ROUTE,
  RELATION_ENTITY_CONFIG,
  type EntityKind,
} from "../constants/relation.constants";
import { normalizeRelation } from "../utils/normalize-relation";
import type { RelatedEntity, RelatedEntityCard } from "../types/relation.types";

/**
 * Tenant-safe чтение всех активных связей сущности В ОБЕ СТОРОНЫ:
 *   (source = entity) OR (target = entity)
 * + гидрация связанных сущностей до карточек.
 *
 * Всё scope по organization_id из серверного контекста + RLS. Soft-deleted
 * связи и сущности невидимы (RLS / deleted_at IS NULL). Связи к неподдержи-
 * ваемым типам и к уже удалённым сущностям отбрасываются.
 *
 * select без "*": колонки гидрации перечислены явно.
 */
export async function fetchEntityRelations(
  supabase: SupabaseClient,
  organizationId: string,
  entityType: EntityKind,
  entityId: string,
): Promise<RelatedEntity[]> {
  const { data, error } = await supabase
    .from("entity_links")
    .select(ENTITY_LINK_COLUMNS)
    .eq("organization_id", organizationId)
    .or(
      `and(source_type.eq.${entityType},source_id.eq.${entityId}),` +
        `and(target_type.eq.${entityType},target_id.eq.${entityId})`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchEntityRelations] failed:", error.message);
    return [];
  }

  const normalized = (data as EntityLink[])
    .map((link) => normalizeRelation(link, entityType, entityId))
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (normalized.length === 0) return [];

  // Сгруппировать id по виду сущности для батч-гидрации.
  const idsByKind = new Map<EntityKind, Set<string>>();
  for (const n of normalized) {
    const set = idsByKind.get(n.other.type) ?? new Set<string>();
    set.add(n.other.id);
    idsByKind.set(n.other.type, set);
  }

  const cards = await hydrateCards(supabase, organizationId, idsByKind);

  const result: RelatedEntity[] = [];
  for (const n of normalized) {
    const card = cards.get(`${n.other.type}:${n.other.id}`);
    if (!card) continue; // сущность удалена/недоступна — пропускаем связь
    result.push({
      relationId: n.relationId,
      relationType: n.relationType,
      relationDirection: n.relationDirection,
      perspective: n.perspective,
      metadata: n.metadata,
      createdAt: n.createdAt,
      entity: card,
    });
  }

  return result;
}

const CARD_KEY = (type: EntityKind, id: string) => `${type}:${id}`;

/** Батч-гидрация связанных сущностей по таблицам (tenant-scoped + RLS). */
async function hydrateCards(
  supabase: SupabaseClient,
  organizationId: string,
  idsByKind: Map<EntityKind, Set<string>>,
): Promise<Map<string, RelatedEntityCard>> {
  const cards = new Map<string, RelatedEntityCard>();

  await Promise.all(
    [...idsByKind.entries()].map(async ([kind, idSet]) => {
      const ids = [...idSet];
      if (ids.length === 0) return;

      if (kind === "task") {
        const { data } = await supabase
          .from(RELATION_ENTITY_CONFIG.task.table)
          .select("id, title, status, due_date")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("id", ids);
        for (const row of data ?? []) {
          cards.set(CARD_KEY("task", row.id as string), {
            type: "task",
            id: row.id as string,
            title: (row.title as string) || "Untitled task",
            subtitle: (row.due_date as string | null) ?? null,
            status: (row.status as string | null) ?? null,
            amount: null,
            currency: null,
            href: ENTITY_KIND_ROUTE.task(row.id as string),
          });
        }
        return;
      }

      if (kind === "document") {
        const { data } = await supabase
          .from(RELATION_ENTITY_CONFIG.document.table)
          .select("id, title, doc_type, status")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("id", ids);
        for (const row of data ?? []) {
          cards.set(CARD_KEY("document", row.id as string), {
            type: "document",
            id: row.id as string,
            title: (row.title as string) || "Untitled document",
            subtitle: (row.doc_type as string | null) ?? null,
            status: (row.status as string | null) ?? null,
            amount: null,
            currency: null,
            href: ENTITY_KIND_ROUTE.document(row.id as string),
          });
        }
        return;
      }

      if (kind === "transaction") {
        const { data } = await supabase
          .from(RELATION_ENTITY_CONFIG.transaction.table)
          .select("id, title, amount, currency, transaction_date, type")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("id", ids);
        for (const row of data ?? []) {
          cards.set(CARD_KEY("transaction", row.id as string), {
            type: "transaction",
            id: row.id as string,
            title: (row.title as string) || "Transaction",
            subtitle: (row.transaction_date as string | null) ?? null,
            status: (row.type as string | null) ?? null,
            amount: typeof row.amount === "number" ? row.amount : null,
            currency: (row.currency as string | null) ?? null,
            href: ENTITY_KIND_ROUTE.transaction(row.id as string),
          });
        }
        return;
      }

      // subscription — нет deleted_at, фильтруем только по org + RLS
      const { data } = await supabase
        .from(RELATION_ENTITY_CONFIG.subscription.table)
        .select("id, name, amount, currency, next_billing_date, is_active")
        .eq("organization_id", organizationId)
        .in("id", ids);
      for (const row of data ?? []) {
        cards.set(CARD_KEY("subscription", row.id as string), {
          type: "subscription",
          id: row.id as string,
          title: (row.name as string) || "Subscription",
          subtitle: (row.next_billing_date as string | null) ?? null,
          status: row.is_active === false ? "inactive" : "active",
          amount: typeof row.amount === "number" ? row.amount : null,
          currency: (row.currency as string | null) ?? null,
          href: ENTITY_KIND_ROUTE.subscription(row.id as string),
        });
      }
    }),
  );

  return cards;
}
