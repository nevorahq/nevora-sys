import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** A project a new task can be filed under — the picker and the classifier's list. */
export interface ProjectOption {
  id: string;
  name: string;
  workspaceId: string;
}

/**
 * Enough for a picker and a prompt; an organization with more live projects
 * sees the most recently touched ones.
 */
export const PROJECT_OPTIONS_LIMIT = 50;

/**
 * Live projects of an organization (every workspace): not archived, and active
 * or paused — a completed project is not where new work goes.
 *
 * Takes the client explicitly: the Inbox reads it under the user's session,
 * a channel webhook under the service role. The organization filter is what
 * scopes it in the latter case, so it is never optional here.
 */
export async function listProjectOptions(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, workspace_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", ["active", "paused"])
    .order("updated_at", { ascending: false })
    .limit(PROJECT_OPTIONS_LIMIT);

  if (error) {
    console.error("[listProjectOptions] failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string).trim(),
    workspaceId: row.workspace_id as string,
  }));
}
