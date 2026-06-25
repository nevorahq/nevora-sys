import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Task, TaskWithAssignees } from "../types/task.types";
import type { TaskStatus, TaskPriority } from "../constants/task.constants";
import { ACTIVE_STATUSES } from "../constants/task.constants";

export interface GetTasksOptions {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  assigneeId?: string;
  onlyActive?: boolean;
  limit?: number;
  offset?: number;
}

export async function getTasks(
  orgId: string,
  options: GetTasksOptions = {},
): Promise<Task[]> {
  const supabase = await createClient();

  let query = supabase
    .from("todos")
    .select("id, organization_id, workspace_id, created_by, updated_by, title, description, status, priority, due_date, recurrence, recurrence_source_id, position, is_completed, created_at, updated_at, deleted_at")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.onlyActive) {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  }

  if (options.priority) {
    query = query.eq("priority", options.priority);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("position", { ascending: true, nullsFirst: false })
               .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getTasks error:", error);
    return [];
  }

  return (data ?? []) as Task[];
}

export async function getTasksWithAssignees(
  orgId: string,
  options: GetTasksOptions = {},
): Promise<TaskWithAssignees[]> {
  const supabase = await createClient();

  let query = supabase
    .from("todos")
    .select(`
      id, organization_id, workspace_id, created_by, updated_by,
      title, description, status, priority, due_date, recurrence, recurrence_source_id, position,
      is_completed, created_at, updated_at, deleted_at,
      task_assignees (
        id, task_id, user_id, assigned_by, created_at
      )
    `)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.onlyActive) {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in("status", statuses);
  }

  if (options.priority) {
    query = query.eq("priority", options.priority);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  query = query.order("position", { ascending: true, nullsFirst: false })
               .order("created_at", { ascending: false });

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
