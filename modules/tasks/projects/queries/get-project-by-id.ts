import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProjectWithStats } from "../types/project.types";

/**
 * Fetch one project by id, scoped to the caller's organization.
 *
 * The explicit organization_id filter is a defense-in-depth cross-tenant guard
 * on top of RLS: a project id from another org resolves to null, never a row.
 */
export async function getProjectById(
  orgId: string,
  projectId: string,
): Promise<ProjectWithStats | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id, organization_id, workspace_id, name, slug, description,
      status, priority, owner_id, start_date, due_date, completed_at,
      color, icon, progress, created_by, updated_by, created_at, updated_at, archived_at,
      todos:todos!todos_project_id_fkey ( id, status, deleted_at )
    `)
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("getProjectById error:", error);
    return null;
  }
  if (!data) return null;

  const tasks = (Array.isArray(data.todos) ? data.todos : []).filter(
    (t: { deleted_at: string | null }) => t.deleted_at === null,
  );
  const doneCount = tasks.filter((t: { status: string }) => t.status === "done").length;
  const { todos: _todos, ...project } = data;

  return {
    ...project,
    taskCount: tasks.length,
    doneCount,
  } as ProjectWithStats;
}
