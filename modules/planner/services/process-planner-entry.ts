import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { createActionItemForDocument } from "@/modules/action-center/services/create-action-item-for-document";
import { detectPlannerIntent } from "./detect-planner-intent";
import { createPlannerSuggestion } from "./create-planner-suggestion";
import { confidenceBand, type PlannerEntry, type PlannerSuggestion } from "../types/planner.types";
import { mapEntryToMissingInfoActionItem } from "../utils/map-suggestion-to-action-item";

export interface ProcessPlannerEntryResult {
  status: PlannerEntry["status"];
  suggestions: PlannerSuggestion[];
}

/**
 * Turn a captured entry into reviewable suggestions.
 *
 * Flow (spec §13–§16):
 *   captured -> processing -> (AI intent detection) -> suggested | failed
 *
 * Confidence policy:
 *   - Every returned suggestion is stored as pending (the user always reviews).
 *   - A suggestion below the "insufficient" floor still creates a suggestion but
 *     the review item is flagged missing-information (see map util).
 *   - If detection yields NO suggestions at all → entry 'failed' + a
 *     missing-information action item for manual review. Money is never touched.
 *
 * detectPlannerIntent degrades to a deterministic fallback instead of throwing,
 * so 'failed' only happens when even the fallback produced nothing usable.
 */
export async function processPlannerEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entry: PlannerEntry,
): Promise<ProcessPlannerEntryResult> {
  await markStatus(supabase, ctx, entry.id, "processing");
  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "planner_entry.processing_started",
    aggregateType: "planner_entry",
    aggregateId: entry.id,
    payload: {},
  });

  const rawText = entry.raw_text ?? "";

  let detection;
  try {
    detection = await detectPlannerIntent(rawText);
  } catch (error) {
    console.error("[processPlannerEntry] detection failed:", error);
    return failEntry(supabase, ctx, entry, "AI intent detection failed. Review this capture manually.");
  }

  if (!detection.suggestions.length) {
    return failEntry(
      supabase,
      ctx,
      entry,
      detection.missingInformation?.join("; ") || "Could not derive an action. Review manually.",
    );
  }

  const created: PlannerSuggestion[] = [];
  for (const detected of detection.suggestions) {
    const result = await createPlannerSuggestion(supabase, ctx, entry.id, detected);
    if (result.ok) created.push(result.suggestion);
  }

  if (created.length === 0) {
    return failEntry(supabase, ctx, entry, "Could not store suggestions. Review manually.");
  }

  const topConfidence = Math.max(...created.map((s) => s.confidence));
  await supabase
    .from("planner_entries")
    .update({
      status: "suggested",
      ai_detected_intent: detection.detectedIntent,
      ai_confidence: detection.confidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id)
    .eq("organization_id", ctx.org.id);

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "planner_entry.processed",
    aggregateType: "planner_entry",
    aggregateId: entry.id,
    payload: {
      detected_intent: detection.detectedIntent,
      suggestion_count: created.length,
      top_confidence: topConfidence,
      band: confidenceBand(topConfidence),
    },
  });

  return { status: "suggested", suggestions: created };
}

async function markStatus(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entryId: string,
  status: PlannerEntry["status"],
): Promise<void> {
  await supabase
    .from("planner_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("organization_id", ctx.org.id);
}

async function failEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entry: PlannerEntry,
  reason: string,
): Promise<ProcessPlannerEntryResult> {
  await markStatus(supabase, ctx, entry.id, "failed");
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "planner_entry.failed",
      aggregateType: "planner_entry",
      aggregateId: entry.id,
      payload: { reason },
    }),
    // Surface a manual-review item so a failed capture is never silently lost.
    createActionItemForDocument(supabase, ctx, mapEntryToMissingInfoActionItem(entry, reason)),
  ]);
  return { status: "failed", suggestions: [] };
}
