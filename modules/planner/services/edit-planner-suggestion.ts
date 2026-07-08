import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDo, type CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import type { EditPlannerSuggestionInput } from "../schemas/planner-suggestion.schema";
import {
  PLANNER_SUGGESTION_COLUMNS,
  PLANNER_SUGGESTION_OPEN_STATUSES,
  type PlannerSuggestion,
} from "../types/planner.types";

export type EditResult =
  | { ok: true; suggestion: PlannerSuggestion }
  | { ok: false; error: string };

/**
 * Edit a pending suggestion before accepting it. Only safe, user-owned fields
 * are writable (title, description, suggestion_type, proposed_payload) — all
 * whitelisted; the payload is REPLACED, not merged, so stale keys can't linger.
 * Status moves pending → edited (still reviewable / acceptable). An accepted or
 * rejected suggestion is immutable.
 */
export async function editPlannerSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: EditPlannerSuggestionInput,
): Promise<EditResult> {
  if (!canDo(ctx, "planner.suggestion.edit")) {
    return { ok: false, error: "Forbidden" };
  }

  const { data, error } = await supabase
    .from("planner_suggestions")
    .select(PLANNER_SUGGESTION_COLUMNS)
    .eq("id", input.suggestionId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Suggestion not found" };
  const current = data as PlannerSuggestion;

  if (current.status !== "pending" && current.status !== "edited") {
    return { ok: false, error: `Cannot edit a ${current.status} suggestion` };
  }

  const patch: Record<string, unknown> = {
    status: "edited",
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.suggestionType !== undefined) patch.suggestion_type = input.suggestionType;
  if (input.proposedPayload !== undefined) patch.proposed_payload = input.proposedPayload;

  // Compare-and-swap on the open statuses: an edit must not land on a suggestion
  // an in-flight accept has already claimed ('processing'), or the accept would
  // create the entity from a payload the user changed after it was read.
  const { data: updated, error: updateError } = await supabase
    .from("planner_suggestions")
    .update(patch)
    .eq("id", input.suggestionId)
    .eq("organization_id", ctx.org.id)
    .in("status", PLANNER_SUGGESTION_OPEN_STATUSES)
    .select(PLANNER_SUGGESTION_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.error("[editPlannerSuggestion] update failed:", updateError.message);
    return { ok: false, error: "Failed to update suggestion" };
  }
  if (!updated) {
    return { ok: false, error: "This suggestion is no longer editable" };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "planner_suggestion.edited",
    aggregateType: "planner_suggestion",
    aggregateId: input.suggestionId,
    payload: { suggestion_type: (updated as PlannerSuggestion).suggestion_type },
  });

  return { ok: true, suggestion: updated as PlannerSuggestion };
}
