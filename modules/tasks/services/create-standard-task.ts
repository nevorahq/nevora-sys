import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import type { TaskPriority, TaskStatus } from "../constants/task.constants";

export interface CreateStandardTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  /** Task's own deadline (YYYY-MM-DD). */
  dueDate?: string | null;
  /**
   * The planner_suggestion this task was confirmed from, when it came from the
   * Capture Inbox. Supplying it makes the creation idempotent: a retry after a
   * crashed confirm collides with `todos_source_suggestion_unique_idx` (099) and
   * returns the task that already exists instead of a duplicate.
   */
  sourceSuggestionId?: string | null;
}

export type CreateStandardTaskResult =
  | { ok: true; taskId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Create an ordinary (non-financial) task programmatically.
 *
 * Extracted so callers outside the task form — currently the Capture Inbox
 * accept flow — can create a standard task through the SAME rules as
 * createTaskAction (plan-limit reservation, pre-generated UUID to dodge the
 * assignee-trigger SELECT RLS race, task.created event + audit) WITHOUT
 * duplicating task business logic. The interactive form keeps its own action;
 * this is the headless equivalent.
 *
 * Reserves the tasks.count plan counter (a standard task is a real task and must
 * respect the plan). Financial obligations go through createFinancialTask, which
 * is intentionally exempt.
 *
 * Idempotent when `sourceSuggestionId` is given: keyed on
 * (organization_id, source_suggestion_id) by a partial unique index (099). The
 * planner claim in 094 stops two *concurrent* confirms; this stops a confirm that
 * is retried after the process died between "task inserted" and
 * "accepted_entity_id written". Without it that retry silently creates a second
 * task, which is the one failure mode nobody notices until their task list is
 * wrong.
 */
export async function createStandardTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateStandardTaskInput,
): Promise<CreateStandardTaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required" };

  const priority: TaskPriority = input.priority ?? "medium";
  const status: TaskStatus = input.status ?? "todo";
  const dueDate = input.dueDate ?? null;

  let reserved = false;
  try {
    await reserveOrganizationUsage(ctx.org.id, "tasks.count", 1);
    reserved = true;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Plan limit reached." };
  }

  const sourceSuggestionId = input.sourceSuggestionId ?? null;

  const taskId = randomUUID();
  const { error } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    title,
    description: input.description ?? "",
    priority,
    status,
    due_date: dueDate,
    recurrence: "none",
    source_suggestion_id: sourceSuggestionId,
  });

  if (error) {
    // 23505 on todos_source_suggestion_unique_idx → this suggestion already
    // produced a task. A crashed confirm was retried. Return the existing task:
    // the caller records it as the accepted entity and the confirm becomes a
    // no-op, which is precisely what exactly-once means here.
    if (error.code === "23505" && sourceSuggestionId) {
      const { data: existing } = await supabase
        .from("todos")
        .select("id")
        .eq("organization_id", ctx.org.id)
        .eq("source_suggestion_id", sourceSuggestionId)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        // No new row, so the reservation must go back — otherwise every retry
        // burns a slot of tasks.count against a task that was never created.
        if (reserved) await releaseOrganizationUsage(ctx.org.id, "tasks.count", 1);
        return { ok: true, taskId: existing.id as string, created: false };
      }
    }

    console.error("[createStandardTask] insert failed:", error.message);
    if (reserved) await releaseOrganizationUsage(ctx.org.id, "tasks.count", 1);
    return { ok: false, error: "Failed to create task" };
  }

  // Row committed — the reservation now legitimately backs it. Events are emitted
  // only on this path: the dedup branch above returned early, so a retried confirm
  // never re-emits task.created for a task that already existed.
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "task.created",
      aggregateType: "task",
      aggregateId: taskId,
      payload: { title, priority, due_date: dueDate },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "todos",
      entityId: taskId,
      action: "create",
      newData: { title, priority, status, due_date: dueDate },
      metadata: { source: "dashboard", trigger: "planner" },
    }),
  ]);

  return { ok: true, taskId, created: true };
}
