import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionItem } from "../types/action-item.types";
import type { ActionFeedItem } from "../types/action-center.types";

/**
 * Денормализация для карточек фида: имя ответственного (profiles) и число
 * связанных сущностей (action_item_links). Батч-запросы, без N+1.
 */
export async function hydrateFeedItems(
  supabase: SupabaseClient,
  organizationId: string,
  items: ActionItem[],
): Promise<ActionFeedItem[]> {
  if (items.length === 0) return [];

  const assigneeIds = [...new Set(items.map((i) => i.assigned_to).filter((id): id is string => Boolean(id)))];
  const itemIds = items.map((i) => i.id);

  const [{ data: profiles }, { data: links }] = await Promise.all([
    assigneeIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    supabase
      .from("action_item_links")
      .select("action_item_id")
      .eq("organization_id", organizationId)
      .in("action_item_id", itemIds),
  ]);

  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null)?.trim() || null]));
  const counts = new Map<string, number>();
  for (const l of links ?? []) {
    const id = l.action_item_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return items.map((item) => ({
    ...item,
    assignee_name: item.assigned_to ? names.get(item.assigned_to) ?? null : null,
    related_count: counts.get(item.id) ?? 0,
  }));
}
