import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { detectPlannerIntent } from "./detect-planner-intent";
import { createPlannerSuggestion } from "./create-planner-suggestion";
import { loadProjectCandidates } from "./load-project-candidates";
import { PLANNER_ENTRY_COLUMNS, type PlannerEntry, type PlannerEntryStatus } from "../types/planner.types";

const OPEN_CAPTURE: PlannerEntryStatus[] = ["captured", "processing", "suggested"];

/** The open Inbox capture a document came from, or null for a plain upload. */
export async function findDocumentCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<PlannerEntry | null> {
  const { data, error } = await supabase
    .from("planner_entries")
    .select(PLANNER_ENTRY_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("source_document_id", documentId)
    .in("status", OPEN_CAPTURE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[findDocumentCapture] lookup failed:", error.message);
    return null;
  }
  return (data as PlannerEntry | null) ?? null;
}

/**
 * Work route for a captured non-financial document (ADR 002, step 0.3): read the
 * actions its text asks for and attach them to the capture as task drafts, the
 * same drafts a typed capture produces. Returns how many drafts the capture has.
 *
 * Not metered separately: the capture already spent its AI call on extraction,
 * and this pass runs the small model over at most a few thousand characters.
 */
export async function proposeTasksFromDocumentCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  capture: PlannerEntry,
  text: string,
): Promise<number> {
  // A retried extraction must not stack a second set of drafts on the capture.
  const { count: existing } = await supabase
    .from("planner_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.org.id)
    .eq("planner_entry_id", capture.id);
  if (existing) return existing;

  const detection = await detectPlannerIntent(text, {
    source: "document",
    projects: await loadProjectCandidates(supabase, ctx),
  });

  let created = 0;
  for (const detected of detection.suggestions) {
    const result = await createPlannerSuggestion(supabase, ctx, capture.id, detected);
    if (result.ok) created += 1;
  }

  if (created > 0) {
    await supabase
      .from("planner_entries")
      .update({
        ai_detected_intent: detection.detectedIntent,
        ai_confidence: detection.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", capture.id)
      .eq("organization_id", ctx.org.id);
  }

  return created;
}
