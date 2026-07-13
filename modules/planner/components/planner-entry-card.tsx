import { Card } from "@/shared/ui/card";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { PlannerEntryWithSuggestions } from "../types/planner.types";
import { PlannerEntryEditor } from "./planner-entry-editor";
import { PlannerSuggestionCard } from "./planner-suggestion-card";

interface PlannerEntryCardProps {
  entry: PlannerEntryWithSuggestions;
  dict: Dictionary["inbox"];
  canUpdate: boolean;
  canDelete: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  captured: "bg-surface-sunken text-text-secondary",
  processing: "bg-accent-yellow/20 text-text-primary",
  suggested: "bg-info-soft text-info",
  accepted: "bg-success-soft text-success",
  rejected: "bg-surface-sunken text-text-tertiary",
  failed: "bg-danger-soft text-danger",
  archived: "bg-surface-sunken text-text-tertiary",
};

/** Capture-state chip styling for document/photo captures (derived from extraction). */
const CAPTURE_STATE_STYLES: Record<string, string> = {
  processing: "bg-accent-yellow/20 text-text-primary",
  review_ready: "bg-info-soft text-info",
  needs_review: "bg-accent-yellow/20 text-text-primary",
  failed: "bg-danger-soft text-danger",
};

const CAPTURE_STATE_LABEL_KEY = {
  processing: "processing",
  review_ready: "reviewReady",
  needs_review: "needsReview",
  failed: "failed",
} as const;

/**
 * A single capture with its derived suggestions. Pure presentation — all writes
 * happen through the suggestion cards' Server Actions.
 *
 * Document/photo captures show a live capture-state chip (processing / review
 * ready / needs manual review / failed) derived from their linked Document's
 * extraction, so the state is honest rather than a stale 'processing'.
 */
export function PlannerEntryCard({ entry, dict, canUpdate, canDelete }: PlannerEntryCardProps) {
  const captureState = entry.captureState ?? null;
  const statusLabel = captureState
    ? dict.captureStatuses[CAPTURE_STATE_LABEL_KEY[captureState]]
    : dict.statuses[entry.status] ?? entry.status;
  const chipStyle = captureState
    ? CAPTURE_STATE_STYLES[captureState]
    : STATUS_STYLES[entry.status] ?? STATUS_STYLES.captured;

  return (
    <Card size="sm" className="flex flex-col gap-3">
      <PlannerEntryEditor
        entryId={entry.id}
        rawText={entry.raw_text}
        dict={dict}
        canUpdate={canUpdate}
        canDelete={canDelete}
      >
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipStyle}`}>
          {statusLabel}
        </span>
      </PlannerEntryEditor>

      {(entry.status === "failed" || captureState === "failed") && (
        <p className="text-xs text-danger">{dict.failed}</p>
      )}

      {entry.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          {entry.suggestions.map((s) => (
            <PlannerSuggestionCard key={s.id} suggestion={s} dict={dict} />
          ))}
        </div>
      )}
    </Card>
  );
}
