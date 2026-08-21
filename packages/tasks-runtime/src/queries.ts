import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVE_STATUSES,
  DEFAULT_TASK_SORT,
  type Task,
  type TaskSort,
  type TaskWithDetails,
} from "@nevora/tasks-contracts";
import type { TasksListInput } from "@nevora/tasks-api";

export const TASK_LIST_VIEW = "task_smart_list" as const;

const FINANCIAL_COLUMNS =
  "task_context_type, financial_due_date, reminder_offset_days, amount, currency, provider_name, financial_source_type, financial_source_id, source_document_id, financial_transaction_id, financial_status, financial_confidence, financial_paid_at, financial_skipped_at";

const TASK_VIEW_COLUMNS =
  `id, organization_id, workspace_id, project_id, created_by, updated_by, title, description, status, priority, due_date, recurrence, recurrence_source_id, position, is_completed, created_at, updated_at, deleted_at, priority_weight, is_closed, sort_overdue, ${FINANCIAL_COLUMNS}`;

interface Orderable {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): Orderable;
}

const ASC_NULLS_LAST = { ascending: true, nullsFirst: false } as const;
const DESC = { ascending: false } as const;

/** Apply a fixed, whitelisted sort to the task smart-list query. */
export function applyTaskSort<Q extends Orderable>(query: Q, sort: TaskSort): Q {
  switch (sort) {
    case "due_date_asc":
      return query.order("due_date", ASC_NULLS_LAST).order("created_at", DESC) as Q;
    case "due_date_desc":
      return query
        .order("due_date", { ascending: false, nullsFirst: false })
        .order("created_at", DESC) as Q;
    case "priority_desc":
      return query
        .order("priority_weight", { ascending: true })
        .order("due_date", ASC_NULLS_LAST)
        .order("created_at", DESC) as Q;
    case "created_at_desc":
      return query.order("created_at", DESC) as Q;
    case "created_at_asc":
      return query.order("created_at", { ascending: true }) as Q;
    case "smart_default":
    default:
      return query
        .order("sort_overdue", { ascending: true })
        .order("is_closed", { ascending: true })
        .order("priority_weight", { ascending: true })
        .order("due_date", ASC_NULLS_LAST)
        .order("created_at", DESC) as Q;
  }
}

/** Read the tenant/workspace-bound task list through a supplied DB client. */
export async function listTasks(
  supabase: SupabaseClient,
  organizationId: string,
  workspaceId: string | undefined,
  input: TasksListInput = {},
): Promise<Task[]> {
  let assigneeTaskIds: string[] | null = null;
  if (input.assigneeId) {
    const { data: links } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", input.assigneeId);
    assigneeTaskIds = (links ?? []).map((link) => link.task_id as string);
    if (assigneeTaskIds.length === 0) return [];
  }

  let query = supabase
    .from(TASK_LIST_VIEW)
    .select(TASK_VIEW_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (input.projectId) query = query.eq("project_id", input.projectId);
  if (input.financialOnly) query = query.neq("task_context_type", "standard");
  if (assigneeTaskIds) query = query.in("id", assigneeTaskIds);
  if (input.onlyActive) {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (input.status) {
    query = query.in("status", Array.isArray(input.status) ? input.status : [input.status]);
  }
  if (input.priority) query = query.eq("priority", input.priority);

  query = applyTaskSort(query, input.sort ?? DEFAULT_TASK_SORT);
  if (input.limit) query = query.limit(input.limit);
  if (input.offset !== undefined) {
    query = query.range(input.offset, input.offset + (input.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[tasks-runtime] list failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Task[];
}

/** Read one task with its owned detail relations. */
export async function getTask(
  supabase: SupabaseClient,
  organizationId: string,
  workspaceId: string | undefined,
  taskId: string,
): Promise<TaskWithDetails | null> {
  const { data, error } = await supabase
    .from("todos")
    .select(`
      id, organization_id, workspace_id, created_by, updated_by,
      title, description, status, priority, due_date, recurrence, recurrence_source_id, position,
      is_completed, created_at, updated_at, deleted_at,
      task_context_type, financial_due_date, reminder_offset_days, amount, currency,
      provider_name, financial_source_type, financial_source_id, source_document_id,
      financial_transaction_id, financial_status, financial_confidence, financial_paid_at, financial_skipped_at,
      task_assignees (id, task_id, user_id, assigned_by, created_at),
      task_comments (id, task_id, organization_id, user_id, content, edited_at, deleted_at, created_at, updated_at),
      task_relations (id, task_id, related_task_id, relation_type, created_by, created_at)
    `)
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  const scopedData = data && (!workspaceId || data.workspace_id === workspaceId) ? data : null;

  if (scopedData) {
    return {
      ...scopedData,
      task_assignees: undefined,
      task_comments: undefined,
      task_relations: undefined,
      assignees: Array.isArray(scopedData.task_assignees) ? scopedData.task_assignees : [],
      comments: (Array.isArray(scopedData.task_comments) ? scopedData.task_comments : [])
        .filter((comment) => !comment.deleted_at),
      relations: Array.isArray(scopedData.task_relations) ? scopedData.task_relations : [],
    } as TaskWithDetails;
  }

  if (error) {
    console.warn("[tasks-runtime] extended task read failed; using base query:", error.message);
  }
  const { data: baseTask, error: baseError } = await supabase
    .from("todos")
    .select("*")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (baseError || !baseTask || (workspaceId && baseTask.workspace_id !== workspaceId)) return null;
  return normalizeTaskPreview(baseTask) as TaskWithDetails;
}

export function normalizeTaskPreview<T extends Record<string, unknown>>(task: T) {
  return {
    ...task,
    status: task.status ?? (task.is_completed ? "done" : "todo"),
    priority: task.priority ?? "medium",
    description: task.description ?? "",
    recurrence: task.recurrence ?? "none",
    assignees: [],
    comments: [],
    relations: [],
  };
}

export async function hasPaidTaskForTransaction(
  supabase: SupabaseClient,
  organizationId: string,
  transactionId: string,
  workspaceId?: string,
): Promise<boolean> {
  let query = supabase
    .from("todos")
    .select("id")
    .eq("financial_transaction_id", transactionId)
    .eq("financial_status", "paid")
    .eq("organization_id", organizationId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data } = await query
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
