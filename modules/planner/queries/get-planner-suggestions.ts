import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  PLANNER_SUGGESTION_COLUMNS,
  type PlannerSuggestion,
  type PlannerSuggestionStatus,
} from "../types/planner.types";

/**
 * Suggestions for the current user in the active org, optionally filtered by
 * status and/or entry. Newest first. Personal surface (migration 087): RLS scopes
 * to the owner; the explicit org + owner filters are defense in depth.
 */
export async function getPlannerSuggestions(
  ctx: CurrentContext,
  options: { statuses?: PlannerSuggestionStatus[]; entryId?: string; limit?: number } = {},
): Promise<PlannerSuggestion[]> {
  const supabase = await createClient();
  let query = supabase
    .from("planner_suggestions")
    .select(PLANNER_SUGGESTION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.statuses?.length) query = query.in("status", options.statuses);
  if (options.entryId) query = query.eq("planner_entry_id", options.entryId);

  const { data, error } = await query;
  if (error) {
    console.error("[getPlannerSuggestions] failed:", error.message);
    return [];
  }
  return (data ?? []) as PlannerSuggestion[];
}
