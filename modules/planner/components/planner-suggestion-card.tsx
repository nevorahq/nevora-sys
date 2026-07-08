import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { confidenceBand, type DraftOriginEntry, type PlannerSuggestion } from "../types/planner.types";
import { explainDraft } from "../utils/explain-draft";
import { DraftExplanation } from "./draft-explanation";
import { SuggestionReviewActions } from "./suggestion-review-actions";

interface PlannerSuggestionCardProps {
  suggestion: PlannerSuggestion;
  /**
   * The capture this draft came from. Optional so the card still renders in the
   * entry list, where the origin is the surrounding row and repeating it is noise.
   */
  entry?: DraftOriginEntry | null;
  /** Phase B / B3: show what will change and what links appear before confirming. */
  showExplanation?: boolean;
  dict: Dictionary["inbox"];
}

/**
 * One AI suggestion. Shows the proposed action type, confidence band and — when
 * still pending/edited — the accept/edit/reject controls. Accepted/rejected
 * suggestions render a terminal status instead.
 *
 * In the Review queue it also renders the B3 explanation panel: a draft the user
 * is about to confirm must state its origin and its exact effects first.
 */
export function PlannerSuggestionCard({
  suggestion,
  entry = null,
  showExplanation = false,
  dict,
}: PlannerSuggestionCardProps) {
  const band = confidenceBand(suggestion.confidence);
  const isReviewable = suggestion.status === "pending" || suggestion.status === "edited";
  const typeLabel = dict.types[suggestion.suggestion_type];
  const pct = Math.round(suggestion.confidence * 100);

  return (
    <div className="rounded-(--neu-radius-md) bg-surface-sunken/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
          {typeLabel}
        </span>
        <span className="text-[11px] text-text-tertiary">
          {pct}% {dict.confidence}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-text-primary">{suggestion.title}</p>
      {suggestion.description && (
        <p className="mt-1 text-xs text-text-secondary whitespace-pre-wrap">{suggestion.description}</p>
      )}

      {band !== "ready" && isReviewable && (
        <p className="mt-2 inline-block rounded-full bg-accent-yellow/20 px-2 py-0.5 text-[11px] font-medium text-text-primary">
          {dict.needsReview}
        </p>
      )}

      {isReviewable && showExplanation && (
        <DraftExplanation explanation={explainDraft(suggestion, entry)} dict={dict.draft} />
      )}

      {isReviewable ? (
        <SuggestionReviewActions suggestion={suggestion} dict={dict} />
      ) : (
        <p className="mt-3 border-t border-border-soft pt-2 text-xs text-text-tertiary">
          {suggestion.status === "accepted"
            ? `${dict.accepted}${suggestion.accepted_entity_type ? ` · ${dict.createdEntity}: ${suggestion.accepted_entity_type}` : ""}`
            : suggestion.status === "rejected"
              ? dict.rejected
              : dict.statuses[suggestion.status as keyof typeof dict.statuses] ?? suggestion.status}
        </p>
      )}
    </div>
  );
}
