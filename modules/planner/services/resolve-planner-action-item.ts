import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

/**
 * Resolve the Action Center review item(s) tied to a planner signal once the
 * user has acted (accept / reject). Best-effort: a delivery/resolve failure must
 * never block or roll back the user's decision.
 *
 * The review items were created with source_type='ai' and source_id set to the
 * suggestion id (and, for low-confidence captures, the entry id). We resolve any
 * still-active item for those source ids. Idempotent by construction.
 */
export async function resolvePlannerActionItems(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  sourceIds: string[],
): Promise<void> {
  const ids = sourceIds.filter(Boolean);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "ai")
    .in("source_id", ids)
    .in("status", ["open", "in_progress", "snoozed"]);

  if (error) {
    console.error("[resolvePlannerActionItems] update failed:", error.message);
  }
}
