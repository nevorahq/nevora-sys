import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import type { ActionItemType, ActionSourceType } from "../types/action-item.types";

/**
 * Close action items whose source no longer needs attention.
 *
 * Owning services close their own items synchronously on the happy path (planner
 * accept/reject, financial confirm/reject, transaction post, subscription cancel).
 * This is the REPAIR net for everything that has no synchronous closer — most
 * importantly a task marked done (change-task-status writes no action item) and any
 * source deleted out from under an open signal. Without it, a read-only Action
 * Center (where the user can no longer dismiss anything by hand) would accumulate
 * items it can never clear.
 *
 * Conservative by construction: an item is closed ONLY when its source is provably
 * terminal (done / inactive / no longer a draft / gone). When in doubt it is left
 * open — a lingering item is a smaller sin than silently closing live work.
 *
 * Idempotent and best-effort: it never throws and returns the number closed.
 */

const ACTIVE = ["open", "in_progress", "snoozed", "failed"] as const;

interface ActiveRow {
  id: string;
  type: ActionItemType;
  source_type: ActionSourceType;
  source_id: string;
}

export async function reconcileStaleActionItems(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<{ closed: number }> {
  const orgId = ctx.org.id;

  const { data: rows, error } = await supabase
    .from("action_items")
    .select("id, type, source_type, source_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("status", ACTIVE)
    .limit(500);
  if (error || !rows || rows.length === 0) return { closed: 0 };

  const items = rows as ActiveRow[];
  const bySource = (source: ActionSourceType) => items.filter((r) => r.source_type === source);
  const idsOf = (source: ActionSourceType) => [...new Set(bySource(source).map((r) => r.source_id))];

  // For each source domain, resolve the set of source ids that are STILL live
  // (still qualify for attention). Any active item whose source id is absent from
  // that set is stale and gets closed.
  const staleIds: string[] = [];

  await Promise.all([
    reconcileTasks(supabase, orgId, bySource("task"), idsOf("task"), staleIds),
    reconcileSubscriptions(supabase, orgId, bySource("subscription"), idsOf("subscription"), staleIds),
    reconcileTransactions(supabase, orgId, bySource("transaction"), idsOf("transaction"), staleIds),
    reconcileDocuments(supabase, orgId, bySource("document"), idsOf("document"), staleIds),
    reconcilePlanner(supabase, orgId, bySource("ai"), staleIds),
  ]);

  if (staleIds.length === 0) return { closed: 0 };

  const { error: closeError } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .in("id", staleIds)
    .in("status", ACTIVE);
  if (closeError) {
    // 42501 = RLS write denied (expired-trial write lock). Not an error here.
    if (closeError.code !== "42501") console.error("[reconcileStaleActionItems] close failed:", closeError.message);
    return { closed: 0 };
  }
  return { closed: staleIds.length };
}

/** A task is live while it exists, is not done, and is not soft-deleted. */
async function reconcileTasks(
  supabase: SupabaseClient,
  orgId: string,
  rows: ActiveRow[],
  ids: string[],
  out: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data } = await supabase
    .from("todos")
    .select("id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .neq("status", "done")
    .in("id", ids);
  const live = new Set((data ?? []).map((r) => r.id as string));
  for (const row of rows) if (!live.has(row.source_id)) out.push(row.id);
}

/** A subscription is live while it is active. */
async function reconcileSubscriptions(
  supabase: SupabaseClient,
  orgId: string,
  rows: ActiveRow[],
  ids: string[],
  out: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("id", ids);
  const live = new Set((data ?? []).map((r) => r.id as string));
  for (const row of rows) if (!live.has(row.source_id)) out.push(row.id);
}

/**
 * A transaction that seeded a draft_review is live only while it is still planned;
 * any other transaction signal is live while the row exists (not deleted).
 */
async function reconcileTransactions(
  supabase: SupabaseClient,
  orgId: string,
  rows: ActiveRow[],
  ids: string[],
  out: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data } = await supabase
    .from("money_transactions")
    .select("id, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("id", ids);
  const statusById = new Map((data ?? []).map((r) => [r.id as string, r.status as string]));
  for (const row of rows) {
    const status = statusById.get(row.source_id);
    if (status === undefined) out.push(row.id); // deleted / gone
    else if (row.type === "draft_review" && status !== "planned") out.push(row.id); // already confirmed/rejected
  }
}

/** A document_review is live only while the document is still a draft. */
async function reconcileDocuments(
  supabase: SupabaseClient,
  orgId: string,
  rows: ActiveRow[],
  ids: string[],
  out: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data } = await supabase
    .from("documents")
    .select("id, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .in("id", ids);
  const statusById = new Map((data ?? []).map((r) => [r.id as string, r.status as string]));
  for (const row of rows) {
    const status = statusById.get(row.source_id);
    if (status === undefined) out.push(row.id);
    else if (row.type === "document_review" && status !== "draft") out.push(row.id);
  }
}

/**
 * A planner review item's source_id is the planner_suggestion id. It is live while
 * the suggestion is still open (pending / edited / processing). Once accepted /
 * rejected / expired the item is stale — this backstops resolvePlannerActionItems.
 * Entry-sourced items (missing_information keyed on an entry id) are left alone:
 * their id space overlaps neither table cleanly, so closing them here is unsafe.
 */
async function reconcilePlanner(
  supabase: SupabaseClient,
  orgId: string,
  rows: ActiveRow[],
  out: string[],
): Promise<void> {
  if (rows.length === 0) return;
  const ids = [...new Set(rows.map((r) => r.source_id))];
  const { data } = await supabase
    .from("planner_suggestions")
    .select("id")
    .eq("organization_id", orgId)
    .in("status", ["pending", "edited", "processing"])
    .in("id", ids);
  const openSuggestions = new Set((data ?? []).map((r) => r.id as string));

  // Distinguish "this source_id is a suggestion that is now closed" from "this
  // source_id was never a suggestion" (an entry). Only the former is closed.
  const { data: known } = await supabase
    .from("planner_suggestions")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", ids);
  const knownSuggestions = new Set((known ?? []).map((r) => r.id as string));

  for (const row of rows) {
    if (knownSuggestions.has(row.source_id) && !openSuggestions.has(row.source_id)) out.push(row.id);
  }
}
