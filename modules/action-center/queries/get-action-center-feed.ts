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
 * по секциям + блок недавно закрытых. Keyset-пагинация по (priority_score, id).
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
    const [scoreRaw, id] = f.cursor.split(".");
    const score = Number(scoreRaw);
    if (Number.isFinite(score) && id) {
      active = active.or(`priority_score.lt.${score},and(priority_score.eq.${score},id.lt.${id})`);
    }
  }

  const { data: activeRows, error } = await active
    .order("priority_score", { ascending: false })
    .order("id", { ascending: false })
    .limit(f.limit);

  if (error) {
    console.error("[getActionCenterFeed] failed:", error.message);
    return { sections: emptySections(), nextCursor: null };
  }

  const items = (activeRows ?? []) as ActionItem[];

  // ── Недавно закрытые (только первая страница) ───────────
  let resolvedRows: ActionItem[] = [];
  if (!f.cursor) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("action_items")
      .select(ACTION_ITEM_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .in("status", ["resolved", "dismissed"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(10);
    resolvedRows = (recent ?? []) as ActionItem[];
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
      ? `${items[items.length - 1].priority_score}.${items[items.length - 1].id}`
      : null;

  return { sections, nextCursor };
}

function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
