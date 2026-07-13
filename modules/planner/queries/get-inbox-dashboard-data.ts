import "server-only";
import type { CurrentContext } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import type {
  DocumentCaptureState,
  DraftOriginEntry,
  InboxDashboardData,
  PendingDraft,
  PlannerEntryWithSuggestions,
  PlannerSuggestion,
} from "../types/planner.types";
import { getPlannerEntries } from "./get-planner-entries";
import { getPlannerSuggestions } from "./get-planner-suggestions";

/** Map a document_extractions.status to the Inbox capture card's honest state. */
function deriveCaptureState(extractionStatus: string | null | undefined): DocumentCaptureState {
  switch (extractionStatus) {
    case "completed":
      return "review_ready";
    case "needs_review":
      return "needs_review";
    case "failed":
      return "failed";
    // pending / processing / null → still working (or just queued).
    default:
      return "processing";
  }
}

/**
 * For document/photo captures, resolve the live extraction state of each linked
 * Document so the Inbox card shows an honest processing/ready/needs-review chip
 * instead of a stale 'processing'. One scoped query, keyed on the source pointer.
 */
async function hydrateCaptureStates(
  ctx: CurrentContext,
  entries: PlannerEntryWithSuggestions[],
): Promise<void> {
  const documentIds = Array.from(
    new Set(entries.filter((e) => e.source_document_id).map((e) => e.source_document_id as string)),
  );
  if (documentIds.length === 0) return;

  const supabase = await createClient();
  const { data: extractions } = await supabase
    .from("document_extractions")
    .select("document_id, status, created_at")
    .eq("organization_id", ctx.org.id)
    .in("document_id", documentIds)
    .order("created_at", { ascending: false });

  // Latest extraction per document (rows are newest-first).
  const latest = new Map<string, string>();
  for (const row of extractions ?? []) {
    const id = row.document_id as string;
    if (!latest.has(id)) latest.set(id, row.status as string);
  }

  for (const entry of entries) {
    if (!entry.source_document_id) continue;
    entry.captureState = deriveCaptureState(latest.get(entry.source_document_id));
  }
}

/**
 * Single read for the Inbox page composition. Joins recent entries with their
 * suggestions in memory (two scoped queries, no N+1) and exposes the pending
 * queue for the Review tab.
 */
export async function getInboxDashboardData(
  ctx: CurrentContext,
): Promise<InboxDashboardData> {
  const [entries, suggestions] = await Promise.all([
    getPlannerEntries(ctx, { limit: 50 }),
    getPlannerSuggestions(ctx, { limit: 200 }),
  ]);

  const byEntry = new Map<string, PlannerSuggestion[]>();
  for (const s of suggestions) {
    const list = byEntry.get(s.planner_entry_id) ?? [];
    list.push(s);
    byEntry.set(s.planner_entry_id, list);
  }

  const entriesWithSuggestions: PlannerEntryWithSuggestions[] = entries.map((entry) => ({
    ...entry,
    suggestions: byEntry.get(entry.id) ?? [],
    captureState: null,
  }));

  await hydrateCaptureStates(ctx, entriesWithSuggestions);

  // Pair each pending suggestion with the capture that produced it, so the review
  // card can explain its own origin without a per-card query. Entries are already
  // loaded above; an older capture outside that page yields a null origin, which
  // the card renders as an unattributed draft rather than guessing.
  const originByEntry = new Map<string, DraftOriginEntry>(
    entries.map((e) => [e.id, { source: e.source, raw_text: e.raw_text, ai_detected_intent: e.ai_detected_intent }]),
  );

  const pendingDrafts: PendingDraft[] = suggestions
    .filter((s) => s.status === "pending" || s.status === "edited")
    .map((suggestion) => ({
      suggestion,
      entry: originByEntry.get(suggestion.planner_entry_id) ?? null,
    }));

  return {
    entries: entriesWithSuggestions,
    pendingDrafts,
    counts: {
      captured: entries.filter((e) => e.status !== "archived" && e.status !== "accepted" && e.status !== "rejected").length,
      pending: pendingDrafts.length,
    },
  };
}
