import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { confidenceBand, type PlannerSuggestion } from "../types/planner.types";
import { SuggestionReviewActions } from "./suggestion-review-actions";

interface PlannerSuggestionCardProps {
  suggestion: PlannerSuggestion;
  dict: Dictionary["inbox"];
}

/**
 * One AI suggestion. Shows the proposed action type, confidence band and — when
 * still pending/edited — the accept/edit/reject controls. Accepted/rejected
 * suggestions render a terminal status instead.
 */
export function PlannerSuggestionCard({ suggestion, dict }: PlannerSuggestionCardProps) {
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
