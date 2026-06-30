import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProjectWithStats } from "../types/project.types";
import type { ProjectStatus } from "../constants/project.constants";
import { VISIBLE_PROJECT_STATUSES } from "../constants/project.constants";

export interface GetProjectsOptions {
  status?: ProjectStatus | ProjectStatus[];
  includeArchived?: boolean;
}

/**
 * List projects for an organization with live task counts.
 *
 * RLS (projects_select) already restricts rows to the caller's org; the
 * explicit organization_id filter keeps the query intent obvious and lets the
 * org index do the work. Task counts are derived from non-deleted todos.
 */
export async function getProjects(
  orgId: string,
  options: GetProjectsOptions = {},
): Promise<ProjectWithStats[]> {
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(`
      id, organization_id, workspace_id, name, slug, description,
      status, priority, owner_id, start_date, due_date, completed_at,
      color, icon, progress, created_by, updated_by, created_at, updated_at, archived_at,
      todos:todos!todos_project_id_fkey ( id, status, deleted_at )
    `)
    .eq("organization_id", orgId);

  if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }

  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  } else if (!options.includeArchived) {
    query = query.in("status", VISIBLE_PROJECT_STATUSES);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getProjects error:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const tasks = (Array.isArray(row.todos) ? row.todos : []).filter(
      (t: { deleted_at: string | null }) => t.deleted_at === null,
    );
    const doneCount = tasks.filter((t: { status: string }) => t.status === "done").length;
    const { todos: _todos, ...project } = row;
    return {
      ...project,
      taskCount: tasks.length,
      doneCount,
    } as ProjectWithStats;
  });
}
