import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/modules/tasks/types/task.types";
import { applyTaskSort, TASK_LIST_VIEW } from "@/modules/tasks/queries/apply-task-sort";
import { DEFAULT_TASK_SORT, type TaskSort } from "@/modules/tasks/constants/task-sort.constants";

const TASK_COLUMNS =
  "id, organization_id, workspace_id, project_id, created_by, updated_by, title, description, status, priority, due_date, recurrence, recurrence_source_id, position, is_completed, created_at, updated_at, deleted_at";

// The view exposes the same base columns plus the generated sort keys it orders by.
const TASK_VIEW_COLUMNS = `${TASK_COLUMNS}, priority_weight, is_closed, sort_overdue`;

/**
 * Tasks belonging to a project, scoped to the caller's organization and sorted
 * server-side (smart_default by default).
 *
 * RLS on todos already restricts visibility; the explicit organization_id +
 * project_id filters make the project-scoped index the access path. If the
 * sort view is unavailable, falls back to the base table.
 */
export async function getProjectTasks(
  orgId: string,
  projectId: string,
  sort: TaskSort = DEFAULT_TASK_SORT,
): Promise<Task[]> {
  const supabase = await createClient();

  const viewQuery = applyTaskSort(
    supabase
      .from(TASK_LIST_VIEW)
      .select(TASK_VIEW_COLUMNS)
      .eq("organization_id", orgId)
      .eq("project_id", projectId)
      .is("deleted_at", null),
    sort,
  );
  const { data, error } = await viewQuery;

  if (!error) {
    return (data ?? []) as unknown as Task[];
  }

  console.warn("getProjectTasks: sort view unavailable, falling back to todos:", error.message);

  const { data: fallback, error: fallbackError } = await supabase
    .from("todos")
    .select(TASK_COLUMNS)
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (fallbackError) {
    console.error("getProjectTasks error:", fallbackError);
    return [];
  }

  return (fallback ?? []) as unknown as Task[];
}

/**
 * Org tasks that are not yet assigned to any project — candidates for the
 * "add existing task" picker on a project page.
 */
export async function getUnassignedTasks(orgId: string, limit = 50): Promise<Task[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("todos")
    .select(TASK_COLUMNS)
    .eq("organization_id", orgId)
    .is("project_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getUnassignedTasks error:", error);
    return [];
  }

  return (data ?? []) as unknown as Task[];
}
