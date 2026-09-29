import { isFinancialSuggestionType, type PlannerSuggestion, type PlannerSuggestionType } from "../types/planner.types";

/** Drafts that confirm into a task — the ones a project applies to (ADR 002, 0.2b). */
export function isTaskDraft(type: PlannerSuggestionType): boolean {
  return type === "create_task" || isFinancialSuggestionType(type);
}

/** The project a draft is filed under, if any. Validated again at accept time. */
export function draftProjectId(suggestion: Pick<PlannerSuggestion, "proposed_payload">): string | null {
  const value = suggestion.proposed_payload?.projectId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The payload an edit writes back. The edit REPLACES the payload, so the
 * existing keys (dueDate, priority, linkTo, …) are carried over and only the
 * project changes; "" from the picker means no project.
 */
export function withDraftProject(payload: Record<string, unknown>, projectId: string): Record<string, unknown> {
  const { projectId: _previous, ...rest } = payload;
  return projectId ? { ...rest, projectId } : rest;
}
