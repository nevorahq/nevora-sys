import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext } from "@nevora/tasks-api";
import {
  type CreateGeneratedTaskInput,
  type CreateStandardTaskInput,
  type CreateStandardTaskResult,
  type GeneratedTaskMutationResult,
  type RetireGeneratedTasksInput,
  type TaskPriority,
  type TaskStatus,
  type UpdateGeneratedTaskDueDateInput,
} from "@nevora/tasks-contracts";
import type { TasksRuntimeEffects } from "./effects";

export async function createStandardTask(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
  effects: TasksRuntimeEffects,
  input: CreateStandardTaskInput,
): Promise<CreateStandardTaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required" };

  const priority: TaskPriority = input.priority ?? "medium";
  const status: TaskStatus = input.status ?? "todo";
  const dueDate = input.dueDate ?? null;
  const sourceSuggestionId = input.sourceSuggestionId ?? null;
  const projectId = input.projectId ?? null;

  // A project decides the workspace: the task lives where its project lives.
  // Resolved before the quota is reserved, and always scoped to the bound
  // organization — the service-role runtime has no RLS to fall back on.
  let workspaceId = context.workspaceId;
  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, workspace_id, archived_at")
      .eq("id", projectId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (projectError) {
      console.error("[tasks-runtime] project lookup failed:", projectError.message);
      return { ok: false, error: "Failed to create task" };
    }
    if (!project || project.archived_at) {
      return { ok: false, error: "Project not found", code: "project_not_found" };
    }
    workspaceId = project.workspace_id as string;
  }

  let reserved = false;

  try {
    await effects.reserveTaskUsage();
    reserved = true;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Plan limit reached.",
    };
  }

  const taskId = randomUUID();
  const { error } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: context.organizationId,
    workspace_id: workspaceId,
    project_id: projectId,
    created_by: context.actorId,
    updated_by: context.actorId,
    title,
    description: input.description ?? "",
    priority,
    status,
    due_date: dueDate,
    recurrence: "none",
    source_suggestion_id: sourceSuggestionId,
  });

  if (error) {
    if (error.code === "23505" && sourceSuggestionId) {
      // Mirrors todos_source_suggestion_unique_idx (organization, suggestion):
      // the first confirm may have landed in the project's workspace.
      const { data: existing } = await supabase
        .from("todos")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("source_suggestion_id", sourceSuggestionId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) {
        if (reserved) await effects.releaseTaskUsage();
        return { ok: true, taskId: existing.id as string, created: false };
      }
    }
    console.error("[tasks-runtime] standard task insert failed:", error.message);
    if (reserved) await effects.releaseTaskUsage();
    return { ok: false, error: "Failed to create task" };
  }

  await Promise.all([
    effects.emitDomainEvent({
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority, due_date: dueDate, project_id: projectId },
    }),
    effects.emitAuditLog({
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: { title, priority, status, due_date: dueDate, project_id: projectId },
      metadata: { source: "dashboard", trigger: "planner" },
    }),
    projectId ? recalculateProjectProgress(supabase, projectId) : Promise.resolve(),
  ]);

  return { ok: true, taskId, created: true };
}

/**
 * Best-effort: a stale progress bar must never fail the task. The RPC is
 * org-member scoped (060), so it updates under a user session and is a no-op
 * under the service role; the next status change recomputes it either way.
 */
async function recalculateProjectProgress(supabase: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await supabase.rpc("recalculate_project_progress", { p_project_id: projectId });
  if (error) console.error("[tasks-runtime] project progress recalculation failed:", error.message);
}

export async function createGeneratedTask(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
  input: CreateGeneratedTaskInput,
): Promise<GeneratedTaskMutationResult> {
  const taskId = randomUUID();
  const { error } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: context.organizationId,
    workspace_id: context.workspaceId,
    created_by: context.actorId,
    updated_by: context.actorId,
    title: input.title,
    description: "",
    priority: "medium",
    status: "in_progress",
    due_date: input.dueDate,
    recurrence: "none",
  });
  if (error) {
    console.error("[tasks-runtime] generated task insert failed:", error.message);
    return { ok: false, error: "Failed to create generated task" };
  }
  return { ok: true, taskId };
}

export async function updateGeneratedTaskDueDate(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
  input: UpdateGeneratedTaskDueDateInput,
): Promise<boolean> {
  const { error } = await supabase
    .from("todos")
    .update({ due_date: input.dueDate, updated_by: context.actorId })
    .eq("id", input.taskId)
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", context.workspaceId)
    .is("deleted_at", null);
  if (error) console.error("[tasks-runtime] generated task update failed:", error.message);
  return !error;
}

export async function retireGeneratedTasks(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
  input: RetireGeneratedTasksInput,
): Promise<number> {
  if (input.taskIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("todos")
    .update({
      deleted_at: input.retiredAt ?? new Date().toISOString(),
      updated_by: context.actorId,
    })
    .in("id", input.taskIds)
    .eq("organization_id", context.organizationId)
    .eq("workspace_id", context.workspaceId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[tasks-runtime] generated task retirement failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
