import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDo, type CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import type { RejectPlannerSuggestionInput } from "../schemas/planner-suggestion.schema";
import { PLANNER_SUGGESTION_COLUMNS, type PlannerSuggestion } from "../types/planner.types";
import { resolvePlannerActionItems } from "./resolve-planner-action-item";

export type RejectResult = { ok: true } | { ok: false; error: string };

/**
 * Reject a suggestion. Historical record is preserved (status → rejected, never
 * deleted); the optional reason is stored. Resolves the linked Action Center
 * review item. If this was the entry's only suggestion and none remain pending,
 * the entry is marked rejected too.
 */
export async function rejectPlannerSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: RejectPlannerSuggestionInput,
): Promise<RejectResult> {
  if (!canDo(ctx, "planner.suggestion.reject")) {
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
    return { ok: false, error: `Cannot reject a ${current.status} suggestion` };
  }

  const { error: updateError } = await supabase
    .from("planner_suggestions")
    .update({
      status: "rejected",
      reject_reason: input.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.suggestionId)
    .eq("organization_id", ctx.org.id);

  if (updateError) {
    console.error("[rejectPlannerSuggestion] update failed:", updateError.message);
    return { ok: false, error: "Failed to reject suggestion" };
  }

  // If no other pending/edited suggestions remain for the entry, close the entry.
  const { count } = await supabase
    .from("planner_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.org.id)
    .eq("planner_entry_id", current.planner_entry_id)
    .in("status", ["pending", "edited"]);

  if (!count) {
    await supabase
      .from("planner_entries")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", current.planner_entry_id)
      .eq("organization_id", ctx.org.id);
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "planner_suggestion.rejected",
      aggregateType: "planner_suggestion",
      aggregateId: input.suggestionId,
      payload: { reason: input.reason ?? null },
    }),
    resolvePlannerActionItems(supabase, ctx, [input.suggestionId, current.planner_entry_id]),
  ]);

  return { ok: true };
}
