import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ACTION_ITEM_COLUMNS, type ActionItem, type ActionItemEvent } from "../types/action-item.types";
import type { ActionDetail } from "../types/action-center.types";
import { hydrateFeedItems } from "./hydrate-feed-items";
import { getActionItemRelatedEntities } from "./get-action-item-related-entities";
import { getAvailableActions } from "../services/action-visibility-service";

/**
 * Полная карточка action item для Detail Drawer: item + related entities +
 * история (action_item_events) + permission-aware available actions.
 *
 * Tenant-safe (org из requireOrg + RLS). null, если item не найден/нет доступа.
 */
export async function getActionItemById(actionItemId: string): Promise<ActionDetail | null> {
  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) return null;

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("action_items")
    .select(ACTION_ITEM_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", actionItemId)
    .maybeSingle();

  if (!row) return null;
  const item = row as ActionItem;

  const [[feedItem], related, eventsRes] = await Promise.all([
    hydrateFeedItems(supabase, ctx.org.id, [item]),
    getActionItemRelatedEntities(supabase, ctx.org.id, actionItemId),
    supabase
      .from("action_item_events")
      .select("id, action_item_id, event_name, old_status, new_status, payload, created_by, created_at")
      .eq("organization_id", ctx.org.id)
      .eq("action_item_id", actionItemId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    item: feedItem,
    related,
    events: (eventsRes.data ?? []) as ActionItemEvent[],
    availableActions: getAvailableActions(item, ctx.permissions),
  };
}
