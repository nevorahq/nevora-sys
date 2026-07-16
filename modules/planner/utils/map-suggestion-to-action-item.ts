import type { CreateActionItemInput } from "@/modules/action-center/services/create-action-item-for-document";
import type { PlannerSuggestion, PlannerEntry } from "../types/planner.types";
import { confidenceBand } from "../types/planner.types";

/**
 * Map a planner signal into an Action Center item so the Inbox feeds the single
 * center of attention instead of becoming a second one.
 *
 * We reuse the existing action_items table + its idempotency index
 * (org, type, source_type, source_id). Keying on source_type='ai' + the
 * suggestion/entry id gives us "one active item per signal" for free.
 *
 *   review item        → type 'ai_suggestion', source_id = suggestion.id
 *   missing-info item  → type 'missing_information', source_id = entry.id
 */

export function mapSuggestionToReviewActionItem(
  suggestion: PlannerSuggestion,
): CreateActionItemInput {
  const band = confidenceBand(suggestion.confidence);
  const needsReview = band !== "ready";
  return {
    type: needsReview ? "missing_information" : "ai_suggestion",
    title: needsReview
      ? `Review capture: ${suggestion.title}`
      : `Suggested action: ${suggestion.title}`,
    description:
      suggestion.description ??
      "Open Capture to accept, edit or reject this AI suggestion.",
    // Reuse the existing 'ai' source so the generator/dedup index treat this as
    // an AI signal; source_id is the suggestion so accept/reject can resolve it.
    sourceType: "ai",
    sourceId: suggestion.id,
    primaryEntityType: "planner_suggestion",
    primaryEntityId: suggestion.id,
    aiConfidence: suggestion.confidence,
    aiReason: `Captured via Inbox (${suggestion.suggestion_type}).`,
    metadata: {
      source: "planner",
      planner_entry_id: suggestion.planner_entry_id,
      suggestion_type: suggestion.suggestion_type,
    },
  };
}

export function mapEntryToMissingInfoActionItem(
  entry: PlannerEntry,
  reason: string,
): CreateActionItemInput {
  return {
    type: "missing_information",
    title: `Capture needs review`,
    description: reason,
    sourceType: "ai",
    sourceId: entry.id,
    primaryEntityType: "planner_entry",
    primaryEntityId: entry.id,
    aiConfidence: entry.ai_confidence,
    aiReason: reason,
    metadata: { source: "planner", planner_entry_id: entry.id },
  };
}
