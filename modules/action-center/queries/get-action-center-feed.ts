import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { actionFiltersSchema } from "../schemas/action-filters.schema";
import {
  ACTION_ITEM_COLUMNS,
  TYPE_SECTION,
  type ActionItem,
} from "../types/action-item.types";
import type {
  ActionFeed,
  ActionFeedItem,
  ActionFeedSections,
  ActionFilters,
} from "../types/action-center.types";
import { hydrateFeedItems } from "./hydrate-feed-items";
import { orderRecentlyResolved, RESOLVED_BUFFER, RESOLVED_WINDOW_DAYS } from "./recently-resolved";

function emptySections(): ActionFeedSections {
  return {
    due_soon: [],
    waiting_for_action: [],
    missing_information: [],
    ai_suggestions: [],
    recently_resolved: [],
  };
}

/**
 * Фид Action Center: активные item'ы (open/in_progress/snoozed), сгруппированные
 * по секциям + блок недавно закрытых. Keyset-пагинация по (created_at, id).
 *
 * Tenant-safe: org из requireOrg + RLS. Только whitelisted колонки, без select("*").
 */
export async function getActionCenterFeed(input: ActionFilters = {}): Promise<ActionFeed> {
  const parsed = actionFiltersSchema.safeParse(input);
  const filters = parsed.success ? parsed.data : { limit: 20 as number };

  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) {
    return { sections: emptySections(), nextCursor: null };
  }

  const supabase = await createClient();
  const f = filters as ReturnType<typeof actionFiltersSchema.parse>;

  // ── Активные item'ы ─────────────────────────────────────
  let active = supabase
    .from("action_items")
    .select(ACTION_ITEM_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .in("status", f.status ?? ["open", "in_progress", "snoozed"]);

  if (f.type) active = active.in("type", f.type);
  if (f.priority) active = active.in("priority", f.priority);
  if (f.sourceType) active = active.in("source_type", f.sourceType);
  if (f.assignedTo) active = active.eq("assigned_to", f.assignedTo);
  if (f.workspaceId) active = active.eq("workspace_id", f.workspaceId);
  if (f.search) active = active.ilike("title", `%${escapeIlike(f.search)}%`);

  if (f.cursor) {
    const [createdAt, id] = f.cursor.split("__");
    if (createdAt && id) {
      active = active.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
  }

  const { data: activeRows, error } = await active
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(f.limit);

  if (error) {
    console.error("[getActionCenterFeed] failed:", error.message);
    return { sections: emptySections(), nextCursor: null };
  }

  const items = (activeRows ?? []) as ActionItem[];

  // ── Недавно закрытые (только первая страница) ───────────
  // Очередь по МОМЕНТУ попадания в resolved-лист: resolved_at (resolved) или
  // dismissed_at (dismissed), свежие сверху — а не по общему updated_at, который
  // сдвигает элемент наверх при любом позднем апдейте строки. updated_at всегда
  // >= момента резолва (его бампает триггер action_items_set_updated_at), поэтому
  // фильтр по updated_at в БД — безопасный superset, а точная граница окна и
  // порядок доводятся в памяти по resolvedAt().
  let resolvedRows: ActionItem[] = [];
  if (!f.cursor) {
    const since = new Date(Date.now() - RESOLVED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("action_items")
      .select(ACTION_ITEM_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .in("status", ["resolved", "dismissed"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(RESOLVED_BUFFER);
    resolvedRows = orderRecentlyResolved((recent ?? []) as ActionItem[], since);
  }

  // ── Гидрация (assignee_name, related_count) ─────────────
  const hydrated = await hydrateFeedItems(supabase, ctx.org.id, [...items, ...resolvedRows]);
  const byId = new Map(hydrated.map((h) => [h.id, h]));

  const sections = emptySections();
  for (const item of items) {
    const fi = byId.get(item.id);
    if (fi) sections[TYPE_SECTION[item.type]].push(fi);
  }
  sections.recently_resolved = resolvedRows
    .map((r) => byId.get(r.id))
    .filter((x): x is ActionFeedItem => Boolean(x));

  const nextCursor =
    items.length === f.limit
      ? `${items[items.length - 1].created_at}__${items[items.length - 1].id}`
      : null;

  return { sections, nextCursor };
}

function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
