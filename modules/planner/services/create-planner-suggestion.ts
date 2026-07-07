import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { createActionItemForDocument } from "@/modules/action-center/services/create-action-item-for-document";
import {
  PLANNER_SUGGESTION_COLUMNS,
  type DetectedSuggestion,
  type PlannerSuggestion,
} from "../types/planner.types";
import { mapSuggestionToReviewActionItem } from "../utils/map-suggestion-to-action-item";

export type CreatePlannerSuggestionResult =
  | { ok: true; suggestion: PlannerSuggestion }
  | { ok: false; error: string };

/**
 * Persist one AI suggestion, then surface it in the Action Center (single center
 * of attention). The review item is idempotent via the action_items dedup index
 * (org, type, source_type='ai', source_id=suggestion.id), so a re-run won't
 * create duplicates.
 *
 * Emits planner_suggestion.created. Side effects are best-effort and never roll
 * back the persisted suggestion.
 */
export async function createPlannerSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  plannerEntryId: string,
  detected: DetectedSuggestion,
): Promise<CreatePlannerSuggestionResult> {
  const id = randomUUID();
  const { data, error } = await supabase
    .from("planner_suggestions")
    .insert({
      id,
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      planner_entry_id: plannerEntryId,
      created_by: ctx.user.id,
      owner_user_id: ctx.user.id,
      suggestion_type: detected.suggestionType,
      title: detected.title,
      description: detected.description ?? null,
      proposed_payload: detected.proposedPayload ?? {},
      confidence: detected.confidence,
      status: "pending",
    })
    .select(PLANNER_SUGGESTION_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[createPlannerSuggestion] insert failed:", error?.message);
    return { ok: false, error: "Failed to create suggestion" };
  }

  const suggestion = data as PlannerSuggestion;

  // ── Best-effort side effects ────────────────────────────────────────────
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "planner_suggestion.created",
      aggregateType: "planner_suggestion",
      aggregateId: suggestion.id,
      payload: {
        planner_entry_id: plannerEntryId,
        suggestion_type: suggestion.suggestion_type,
        confidence: suggestion.confidence,
      },
    }),
    createActionItemForDocument(
      supabase,
      ctx,
      mapSuggestionToReviewActionItem(suggestion),
    ),
  ]);

  return { ok: true, suggestion };
}
