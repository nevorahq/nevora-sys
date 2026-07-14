import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  getDocumentExtractionState,
  type DocumentExtractionState,
} from "@/modules/documents/queries/get-document-extraction";

/** A captured document whose extracted expense draft is awaiting confirmation. */
export interface InboxDocumentReview {
  documentId: string;
  title: string;
  state: DocumentExtractionState;
}

/** Cap on heavy per-document state loads — beta captures are few; stay cheap. */
const MAX_DOCUMENT_REVIEWS = 5;

/**
 * Capture-derived financial reviews for the Inbox.
 *
 * A document captured through the Inbox (planner_entry with source_document_id)
 * whose extraction produced an expense draft in `waiting_confirmation` must be
 * confirmable WHERE IT WAS CAPTURED — the Inbox — not only on the Documents page
 * or the (now read-only) Action Center.
 *
 * This is a read-only join over existing tables. Confirmation still routes through
 * the existing review Server Actions and the shared DocumentExtractionReview UI —
 * no confirmation logic is duplicated here, and money safety is unchanged.
 */
export async function getInboxDocumentReviews(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<InboxDocumentReview[]> {
  // 1. The current user's captured documents that are still in-flight.
  const { data: entries } = await supabase
    .from("planner_entries")
    .select("source_document_id")
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("source", "document")
    .not("source_document_id", "is", null)
    .in("status", ["captured", "processing", "suggested"])
    .order("created_at", { ascending: false })
    .limit(30);

  const documentIds = [...new Set((entries ?? []).map((e) => e.source_document_id as string))];
  if (documentIds.length === 0) return [];

  // 2. Of those, the ones with an expense draft that needs the user to confirm.
  const { data: suggestions } = await supabase
    .from("financial_suggestions")
    .select("source_id")
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "document")
    .eq("suggestion_type", "create_expense")
    .eq("review_state", "waiting_confirmation")
    .in("source_id", documentIds)
    .limit(MAX_DOCUMENT_REVIEWS);

  const pendingIds = [...new Set((suggestions ?? []).map((s) => s.source_id as string))];
  if (pendingIds.length === 0) return [];

  // 3. Titles + full extraction state (reused verbatim from Documents).
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title")
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .in("id", pendingIds);
  const titleById = new Map((docs ?? []).map((d) => [d.id as string, (d.title as string) || "Document"]));

  const states = await Promise.all(
    pendingIds.map(async (documentId) => ({
      documentId,
      title: titleById.get(documentId) ?? "Document",
      state: await getDocumentExtractionState(ctx.org.id, documentId),
    })),
  );

  // A concurrent confirm/reject may have moved the draft out of waiting — keep only
  // those still awaiting the user, so the Inbox never shows a stale confirm form.
  return states.filter((review) => review.state.financialSuggestion?.review_state === "waiting_confirmation");
}
