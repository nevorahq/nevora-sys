import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TaskWithDetails } from "../types/task.types";
import { normalizeTaskPreview } from "./normalize-task-preview";

export async function getTaskById(
  orgId: string,
  taskId: string,
): Promise<TaskWithDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("todos")
    .select(`
      id, organization_id, workspace_id, created_by, updated_by,
      title, description, status, priority, due_date, recurrence, recurrence_source_id, position,
      is_completed, created_at, updated_at, deleted_at,
      task_assignees (
        id, task_id, user_id, assigned_by, created_at
      ),
      task_comments (
        id, task_id, organization_id, user_id, content,
        edited_at, deleted_at, created_at, updated_at
      ),
      task_relations (
        id, task_id, related_task_id, relation_type, created_by, created_at
      )
    `)
    .eq("id", taskId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .single();

  if (data) {
    return {
      ...data,
      task_assignees: undefined,
      task_comments: undefined,
      task_relations: undefined,
      assignees: Array.isArray(data.task_assignees) ? data.task_assignees : [],
      comments: (Array.isArray(data.task_comments) ? data.task_comments : [])
        .filter((c) => !c.deleted_at),
      relations: Array.isArray(data.task_relations) ? data.task_relations : [],
    } as TaskWithDetails;
  }

  // Some existing deployments predate the optional task relation tables.
  // The task itself must remain previewable instead of becoming a false 404.
  if (error) console.warn("getTaskById extended query failed; using base task query", error.message);
  const { data: baseTask, error: baseError } = await supabase
    .from("todos")
    .select("*")
    .eq("id", taskId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (baseError || !baseTask) return null;

  return normalizeTaskPreview(baseTask) as TaskWithDetails;
}
