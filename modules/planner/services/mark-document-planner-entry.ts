import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import type { PlannerEntryStatus } from "../types/planner.types";

/**
 * Advance the Inbox capture that a document came from, as the document's own
 * lifecycle moves on.
 *
 * A photo/document capture creates one sourced planner_entry and then hands the
 * file to the Documents extraction pipeline. Nothing used to move that entry off
 * `processing` again, so a finished capture sat in the Inbox as "Processing"
 * forever. The entry is a *capture*, so its status must follow the work the
 * capture produced:
 *
 *   extraction completed  -> suggested  (a review is waiting)
 *   extraction failed     -> failed     (needs manual review)
 *   review confirmed      -> accepted   (the entity exists; capture is done)
 *   review rejected       -> rejected
 *
 * Best-effort and idempotent: only entries still in a NON-terminal state are
 * moved, so a later sweep can never resurrect or overwrite a decided capture, and
 * a failure here never rolls back the caller's real work.
 */
const NON_TERMINAL: PlannerEntryStatus[] = ["captured", "processing", "suggested"];

export async function markDocumentPlannerEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
  status: PlannerEntryStatus,
): Promise<void> {
  const { error } = await supabase
    .from("planner_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("source_document_id", documentId)
    .in("status", NON_TERMINAL);

  if (error) {
    console.error("[markDocumentPlannerEntry] update failed:", error.message);
  }
}
