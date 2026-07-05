import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentContext } from "@/lib/context/current-context";
import { PLANNER_ENTRY_COLUMNS, type PlannerEntry } from "../types/planner.types";

/**
 * Recent captures for the active org (RLS scopes to membership; the explicit
 * org filter is defense in depth). Excludes archived by default.
 */
export async function getPlannerEntries(
  ctx: CurrentContext,
  options: { limit?: number; includeArchived?: boolean } = {},
): Promise<PlannerEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("planner_entries")
    .select(PLANNER_ENTRY_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (!options.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getPlannerEntries] failed:", error.message);
    return [];
  }
  return (data ?? []) as PlannerEntry[];
}
