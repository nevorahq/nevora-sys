import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import type { ActionItem } from "../types/action-item.types";
import {
  ATTENTION_FILTER_KEYS,
  attentionPredicate,
  type AttentionFilterKey,
} from "../services/attention-filter";

/** One row of the read-only Attention list. */
export type AttentionItem = Pick<
  ActionItem,
  | "id"
  | "title"
  | "type"
  | "status"
  | "priority"
  | "source_type"
  | "due_at"
  | "primary_entity_type"
  | "primary_entity_id"
  | "metadata"
>;

const ATTENTION_LIST_COLUMNS =
  "id, title, type, status, priority, source_type, due_at, primary_entity_type, primary_entity_id, metadata" as const;

/** Counts for every summary card, keyed by filter. */
export type AttentionCounts = Record<AttentionFilterKey, number>;

export interface AttentionView {
  filter: AttentionFilterKey;
  items: AttentionItem[];
  counts: AttentionCounts;
}

const LIST_LIMIT = 100;

function emptyCounts(): AttentionCounts {
  return {
    needs_attention: 0,
    due_today: 0,
    upcoming: 0,
    overdue: 0,
    snoozed: 0,
    recently_resolved: 0,
  };
}

/**
 * Read-only Attention view: the counts for all six summary cards plus the rows of
 * the currently-selected filter. Server-side and RLS-scoped — filtering runs over
 * the full action_items set, never a pre-loaded page. Never throws; degrades to an
 * empty view on error so the primary screen still renders.
 *
 * Every query — the six counts and the row list — derives its WHERE clause from
 * the same `attentionPredicate(...)` object and applies it through the identical
 * inline sequence below, so a card's number and its list can never use different
 * conditions.
 */
export async function getAttentionView(filter: AttentionFilterKey, now: Date = new Date()): Promise<AttentionView> {
  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) {
    return { filter, items: [], counts: emptyCounts() };
  }

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const countFor = async (key: AttentionFilterKey): Promise<number> => {
    const predicate = attentionPredicate(key, now);
    let q = supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("status", predicate.statuses);
    if (predicate.dueRequired) q = q.not("due_at", "is", null);
    if (predicate.dueFrom) q = q.gte("due_at", predicate.dueFrom);
    if (predicate.dueBefore) q = q.lt("due_at", predicate.dueBefore);
    if (predicate.updatedFrom) q = q.gte("updated_at", predicate.updatedFrom);
    const { count, error } = await q;
    if (error) {
      console.error(`[getAttentionView] count ${key} failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  };

  const listRows = async (): Promise<AttentionItem[]> => {
    const predicate = attentionPredicate(filter, now);
    let q = supabase
      .from("action_items")
      .select(ATTENTION_LIST_COLUMNS)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("status", predicate.statuses);
    if (predicate.dueRequired) q = q.not("due_at", "is", null);
    if (predicate.dueFrom) q = q.gte("due_at", predicate.dueFrom);
    if (predicate.dueBefore) q = q.lt("due_at", predicate.dueBefore);
    if (predicate.updatedFrom) q = q.gte("updated_at", predicate.updatedFrom);
    // Resolved rows read best "most recently closed first"; active rows "newest
    // signal first". Both are deterministic so the list is stable across renders.
    const orderColumn = filter === "recently_resolved" ? "updated_at" : "created_at";
    const { data, error } = await q.order(orderColumn, { ascending: false }).order("id", { ascending: false }).limit(LIST_LIMIT);
    if (error) {
      console.error("[getAttentionView] list failed:", error.message);
      return [];
    }
    return (data ?? []) as AttentionItem[];
  };

  const [items, ...countValues] = await Promise.all([
    listRows(),
    ...ATTENTION_FILTER_KEYS.map((key) => countFor(key)),
  ]);

  const counts = emptyCounts();
  ATTENTION_FILTER_KEYS.forEach((key, index) => {
    counts[key] = countValues[index];
  });

  return { filter, items, counts };
}
