import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROUTES } from "@/shared/config/routes";
import type { ActionItemLink } from "../types/action-item.types";
import type { ActionRelatedEntity } from "../types/action-center.types";

/** Конфиг гидрации по типу сущности: таблица, поле заголовка, маршрут. */
const ENTITY_CONFIG: Record<string, { table: string; titleField: string; href: (id: string) => string | null }> = {
  task: { table: "todos", titleField: "title", href: (id) => `${ROUTES.tasks}/${id}` },
  document: { table: "documents", titleField: "title", href: (id) => `${ROUTES.documents}/${id}` },
  transaction: { table: "money_transactions", titleField: "title", href: (id) => `${ROUTES.money}/${id}` },
  subscription: { table: "subscriptions", titleField: "name", href: (id) => `${ROUTES.subscriptions}/${id}` },
  deal: { table: "crm_deals", titleField: "title", href: () => ROUTES.crm },
  client: { table: "crm_clients", titleField: "name", href: () => ROUTES.crm },
};

/**
 * Гидрирует связи action item до карточек (title + href), tenant-scoped + RLS.
 * Батчит по типу сущности; связи к удалённым/недоступным сущностям отбрасываются.
 */
export async function getActionItemRelatedEntities(
  supabase: SupabaseClient,
  organizationId: string,
  actionItemId: string,
): Promise<ActionRelatedEntity[]> {
  const { data: links } = await supabase
    .from("action_item_links")
    .select("id, action_item_id, entity_type, entity_id, relation_type, created_at")
    .eq("organization_id", organizationId)
    .eq("action_item_id", actionItemId);

  const rows = (links ?? []) as ActionItemLink[];
  if (rows.length === 0) return [];

  // Сгруппировать id по типу.
  const idsByType = new Map<string, Set<string>>();
  for (const l of rows) {
    if (!ENTITY_CONFIG[l.entity_type]) continue;
    const set = idsByType.get(l.entity_type) ?? new Set<string>();
    set.add(l.entity_id);
    idsByType.set(l.entity_type, set);
  }

  const titles = new Map<string, string>(); // `${type}:${id}` → title
  await Promise.all(
    [...idsByType.entries()].map(async ([type, idSet]) => {
      const cfg = ENTITY_CONFIG[type];
      const { data } = await supabase
        .from(cfg.table)
        .select(`id, ${cfg.titleField}`)
        .eq("organization_id", organizationId)
        .in("id", [...idSet]);
      // Динамический select сбивает типизированный парсер supabase-js → cast.
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        titles.set(`${type}:${row.id as string}`, (row[cfg.titleField] as string) || type);
      }
    }),
  );

  const result: ActionRelatedEntity[] = [];
  for (const l of rows) {
    const cfg = ENTITY_CONFIG[l.entity_type];
    if (!cfg) continue;
    const title = titles.get(`${l.entity_type}:${l.entity_id}`);
    if (!title) continue; // сущность удалена/недоступна
    result.push({
      link_id: l.id,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      relation_type: l.relation_type,
      title,
      href: cfg.href(l.entity_id),
    });
  }
  return result;
}
