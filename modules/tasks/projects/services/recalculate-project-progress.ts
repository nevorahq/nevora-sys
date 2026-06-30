import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recompute a project's progress server-side.
 *
 * Delegates to the SECURITY DEFINER SQL function recalculate_project_progress()
 * (migration 060), which is the single source of truth for the formula
 * (done / all non-deleted tasks * 100) and is org-member scoped. The progress
 * value is therefore never computed or trusted on the client.
 *
 * Call this after any task mutation that can change project membership or
 * status: create, status change, delete, assign-to-project, remove-from-project.
 *
 * Errors are swallowed (logged) — a stale progress number must never roll back
 * the primary task operation.
 */
export async function recalculateProjectProgress(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase.rpc("recalculate_project_progress", {
    p_project_id: projectId,
  });
  if (error) {
    console.error("recalculateProjectProgress error:", error.message);
  }
}
