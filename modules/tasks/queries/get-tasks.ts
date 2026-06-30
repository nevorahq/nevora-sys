import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Task, TaskWithAssignees } from "../types/task.types";
import type { TaskStatus, TaskPriority } from "../constants/task.constants";
import { ACTIVE_STATUSES } from "../constants/task.constants";
import { applyTaskSort, TASK_LIST_VIEW } from "./apply-task-sort";
import { DEFAULT_TASK_SORT, type TaskSort } from "../constants/task-sort.constants";

export interface GetTasksOptions {
  workspaceId?: string;
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  onlyActive?: boolean;
  sort?: TaskSort;
  limit?: number;
  offset?: number;
}

const TASK_VIEW_COLUMNS =
  "id, organization_id, workspace_id, project_id, created_by, updated_by, title, description, status, priority, due_date, recurrence, recurrence_source_id, position, is_completed, created_at, updated_at, deleted_at, priority_weight, is_closed, sort_overdue";

/**
 * Organization tasks with server-side sorting (smart_default by default) and
 * the full filter set: workspace, project, assignee, status, priority +
 * pagination. RLS on the underlying view is the tenant guard; the explicit
 * organization_id filter pins the access path.
 *
 * Sorting and filters compose: the sort is applied to the already-filtered,
 * paginated query, so it stays correct across pages.
 */
export async function getTasks(
  orgId: string,
  options: GetTasksOptions = {},
): Promise<Task[]> {
  const supabase = await createClient();

  // Assignee filter: resolve the user's task ids first (the view is a single
  // table projection without an assignee join), then constrain by id.
  let assigneeTaskIds: string[] | null = null;
  if (options.assigneeId) {
    const { data: links } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", options.assigneeId);
    assigneeTaskIds = (links ?? []).map((l) => l.task_id as string);
    if (assigneeTaskIds.length === 0) return [];
  }

  let query = supabase
    .from(TASK_LIST_VIEW)
    .select(TASK_VIEW_COLUMNS)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  if (assigneeTaskIds) query = query.in("id", assigneeTaskIds);

  if (options.onlyActive) {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  }

  if (options.priority) query = query.eq("priority", options.priority);

  query = applyTaskSort(query, options.sort ?? DEFAULT_TASK_SORT);

  if (options.limit) query = query.limit(options.limit);
  if (options.offset !== undefined) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getTasks error:", error);
    return [];
  }

  return (data ?? []) as unknown as Task[];
}

/**
 * Tasks with their assignees embedded. Kept on the base `todos` table because
 * the embed relationship is detected there directly. Ordering uses the
 * indexable generated columns (is_closed, priority_weight) — this variant does
 * not apply the date-dependent overdue key (that lives on the sort view).
 */
export async function getTasksWithAssignees(
  orgId: string,
  options: GetTasksOptions = {},
): Promise<TaskWithAssignees[]> {
  const supabase = await createClient();

  let query = supabase
    .from("todos")
    .select(`
      id, organization_id, workspace_id, project_id, created_by, updated_by,
      title, description, status, priority, due_date, recurrence, recurrence_source_id, position,
      is_completed, created_at, updated_at, deleted_at,
      task_assignees (
        id, task_id, user_id, assigned_by, created_at
      )
    `)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);
  if (options.projectId) query = query.eq("project_id", options.projectId);

  if (options.onlyActive) {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  }

  if (options.priority) query = query.eq("priority", options.priority);

  query = query
    .order("is_closed", { ascending: true })
    .order("priority_weight", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;

  if (error) {
    console.error("getTasksWithAssignees error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    task_assignees: undefined,
    assignees: Array.isArray(row.task_assignees) ? row.task_assignees : [],
  })) as TaskWithAssignees[];
}
