import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext } from "@nevora/tasks-api";
import {
  buildFinancialTaskTitle,
  calculateActionDueDate,
  normalizeReminderOffset,
  type CreateFinancialTaskCommand,
  type CreateFinancialTaskResult,
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
    workspace_id: context.workspaceId,
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
      const { data: existing } = await supabase
        .from("todos")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("workspace_id", context.workspaceId)
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
      payload: { title, priority, due_date: dueDate },
    }),
    effects.emitAuditLog({
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: { title, priority, status, due_date: dueDate },
      metadata: { source: "dashboard", trigger: "planner" },
    }),
  ]);

  return { ok: true, taskId, created: true };
}

export async function createFinancialTask(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
  effects: TasksRuntimeEffects,
  input: CreateFinancialTaskCommand,
): Promise<CreateFinancialTaskResult> {
  const offset = normalizeReminderOffset(input.reminderOffsetDays);
  const actionDueDate = calculateActionDueDate(input.financialDueDate, offset);

  if (input.sourceId) {
    const { data: existing } = await supabase
      .from("todos")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("workspace_id", context.workspaceId)
      .eq("financial_source_type", input.sourceType)
      .eq("financial_source_id", input.sourceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return { ok: true, taskId: existing.id as string, created: false, actionDueDate };
    }
  }

  const taskId = randomUUID();
  const title = input.title?.trim() || buildFinancialTaskTitle(input.contextType, input.providerName);
  const { error } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: context.organizationId,
    workspace_id: context.workspaceId,
    created_by: context.actorId,
    updated_by: context.actorId,
    title,
    description: "",
    priority: "high",
    status: "in_progress",
    due_date: actionDueDate,
    recurrence: "none",
    task_context_type: input.contextType,
    financial_due_date: input.financialDueDate,
    reminder_offset_days: offset,
    amount: input.amount,
    currency: input.currency,
    provider_name: input.providerName,
    financial_source_type: input.sourceType,
    financial_source_id: input.sourceId,
    source_document_id: input.sourceDocumentId ?? null,
    financial_status: "open",
    financial_confidence: input.confidence ?? null,
  });

  if (error) {
    if (error.code === "23505" && input.sourceId) {
      const { data: raced } = await supabase
        .from("todos")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("workspace_id", context.workspaceId)
        .eq("financial_source_type", input.sourceType)
        .eq("financial_source_id", input.sourceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (raced) {
        return { ok: true, taskId: raced.id as string, created: false, actionDueDate };
      }
    }
    console.error("[tasks-runtime] financial task insert failed:", error.message);
    return { ok: false, error: "Failed to create financial task" };
  }

  if (input.sourceDocumentId) {
    await effects.createDocumentTaskLink({
      documentId: input.sourceDocumentId,
      taskId,
      contextType: input.contextType,
      confidence: input.confidence,
    });
  }

  await Promise.all([
    effects.emitDomainEvent({
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority: "high", due_date: actionDueDate },
    }),
    effects.emitDomainEvent({
      eventName: "financial_task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: {
        context_type: input.contextType,
        provider_name: input.providerName,
        amount: input.amount,
        currency: input.currency,
        financial_due_date: input.financialDueDate,
        reminder_offset_days: offset,
        action_due_date: actionDueDate,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_document_id: input.sourceDocumentId ?? null,
      },
    }),
    effects.emitAuditLog({
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: {
        title,
        task_context_type: input.contextType,
        financial_due_date: input.financialDueDate,
        amount: input.amount,
        currency: input.currency,
        financial_status: "open",
      },
      metadata: { source: "dashboard", trigger: "financial_obligation" },
    }),
  ]);

  return { ok: true, taskId, created: true, actionDueDate };
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
