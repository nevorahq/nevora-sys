import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { publishActionItemEvent } from "./action-event-publisher";
import type { ActionItem } from "../types/action-item.types";

type TaskDeletionInput = {
  taskId: string;
  title: string;
};

const ACTIVE_STATUSES = ["open", "in_progress", "snoozed", "failed"] as const;

/**
 * Metadata stamp that flags an action item as belonging to a DELETED task, so the
 * feed can render a "Deleted" marker. `task_deleted` is the render trigger;
 * `source` keeps the existing convention; `deleted_title` preserves the task name.
 */
export const TASK_DELETED_MARKER = { source: "task_delete", task_deleted: true } as const;

/**
 * Make task deletion visible in Action Center — with an explicit "deleted" marker.
 *
 * Action Center renders action_items, not domain_events/audit_logs. A task can be
 * deleted directly from Tasks without any pre-existing action item, so we create
 * a resolved history item in that case. If attention items already exist for the
 * task, we resolve them AND stamp the deletion marker — previously they were just
 * flipped to "resolved" with their original title, so a deleted task was
 * indistinguishable from a completed one in the "Recently Resolved" list.
 */
export async function recordTaskDeletionInActionCenter(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: TaskDeletionInput,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await supabase
    .from("action_items")
    .select("id, status, metadata")
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "task")
    .eq("source_id", input.taskId)
    .in("status", ACTIVE_STATUSES);

  if (lookupError) {
    console.error("[recordTaskDeletionInActionCenter] lookup failed:", lookupError.message);
    return;
  }

  const existingItems = (existing ?? []) as Pick<ActionItem, "id" | "status" | "metadata">[];
  if (existingItems.length > 0) {
    // Per-row update so we MERGE the marker into existing metadata instead of
    // clobbering it (a batch update would overwrite metadata for every row).
    const results = await Promise.all(existingItems.map((item) =>
      supabase
        .from("action_items")
        .update({
          status: "resolved",
          resolved_at: now,
          metadata: { ...(item.metadata ?? {}), ...TASK_DELETED_MARKER, deleted_title: input.title },
        })
        .eq("organization_id", ctx.org.id)
        .eq("id", item.id),
    ));

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[recordTaskDeletionInActionCenter] resolve failed:", failed.error.message);
      return;
    }

    await Promise.all(existingItems.map((item) => publishActionItemEvent({
      supabase,
      ctx,
      actionItemId: item.id,
      eventName: "action_item.executed",
      oldStatus: item.status,
      newStatus: "resolved",
      payload: { action: "delete_task", confirmed: true, source: "task_delete" },
      audit: {
        action: "update",
        newData: { executed: "delete_task", summary: "Task deleted" },
      },
    })));
    return;
  }

  const { data: created, error } = await supabase
    .from("action_items")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      title: `Deleted task: ${input.title}`.slice(0, 200),
      description: "Task was deleted from the Tasks dashboard.",
      type: "follow_up_required",
      status: "resolved",
      priority: "info",
      priority_score: 0,
      source_type: "task",
      source_id: input.taskId,
      primary_entity_type: "task",
      primary_entity_id: input.taskId,
      resolved_at: now,
      metadata: { ...TASK_DELETED_MARKER, deleted_title: input.title },
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[recordTaskDeletionInActionCenter] insert failed:", error?.message);
    return;
  }

  await publishActionItemEvent({
    supabase,
    ctx,
    actionItemId: created.id as string,
    eventName: "action_item.executed",
    oldStatus: null,
    newStatus: "resolved",
    payload: { action: "delete_task", confirmed: true, source: "task_delete" },
    audit: {
      action: "create",
      newData: { executed: "delete_task", summary: "Task deleted" },
    },
  });
}
