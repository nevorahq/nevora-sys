import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Todo } from "@/entities/todo/model";
import { applyTaskSort, TASK_LIST_VIEW } from "@/modules/tasks/queries/apply-task-sort";
import { DEFAULT_TASK_SORT, type TaskSort } from "@/modules/tasks/constants/task-sort.constants";

interface GetTodosOptions {
  /** Whitelisted sort mode. Defaults to the business-importance order. */
  sort?: TaskSort;
}

/**
 * Query: all tasks visible to the current user in the active organization,
 * sorted server-side.
 *
 * "server-only" — importing this in a Client Component fails the build.
 *
 * RLS (is_org_member) scopes rows to organizations the user belongs to —
 * but a user can have active membership in MORE than one organization
 * (multi-org, Phase 4.3), so RLS alone is not enough to isolate the
 * currently selected organization. We explicitly filter by organizationId
 * (from requireOrg()) on top of RLS — defense in depth, and the only way
 * to avoid mixing tasks from a user's other organizations into this list.
 *
 * Resilience: if the sort view is missing (migration 061 not applied yet, or
 * the PostgREST cache hasn't reloaded), we fall back to the base `todos` table
 * ordered by recency so the Tasks page never breaks.
 */
export async function getTodosQuery(organizationId: string, options: GetTodosOptions = {}): Promise<Todo[]> {
  const supabase = await createClient();
  const sort = options.sort ?? DEFAULT_TASK_SORT;

  // Primary path: sortable view with server-side smart ordering.
  const viewQuery = applyTaskSort(
    supabase.from(TASK_LIST_VIEW).select("*").eq("organization_id", organizationId).is("deleted_at", null),
    sort,
  );
  const { data, error } = await viewQuery;

  if (!error) {
    return (data ?? []).map(normalizeTodoRow);
  }

  console.warn("getTodosQuery: sort view unavailable, falling back to todos:", error.message);

  // Fallback path: base table, original recency order, project embed.
  const { data: fallback, error: fallbackError } = await supabase
    .from("todos")
    .select(`
      *,
      project:projects!todos_project_id_fkey ( id, name, color, status )
    `)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (fallbackError) {
    console.error("getTodosQuery fallback error:", fallbackError);
    return [];
  }

  return (fallback ?? []).map((row) => ({
    ...row,
    project: Array.isArray(row.project) ? (row.project[0] ?? null) : (row.project ?? null),
  })) as Todo[];
}

/**
 * The view denormalizes project fields (project_name/color/status). Rebuild the
 * nested `project` object the UI expects, dropping the flat helpers.
 */
function normalizeTodoRow(row: Record<string, unknown>): Todo {
  const projectId = (row.project_id as string | null) ?? null;
  const project = projectId
    ? {
        id: projectId,
        name: (row.project_name as string) ?? "",
        color: (row.project_color as string | null) ?? null,
        status: (row.project_status as string) ?? "active",
      }
    : null;
  return { ...(row as unknown as Todo), project };
}
