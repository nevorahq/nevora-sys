import { PLANNER_DESCRIPTION_MAX_LENGTH } from "../schemas/planner-suggestion.schema";
import {
  DETECTABLE_SUGGESTION_TYPES,
  type DetectedSuggestion,
  type PlannerIntentDetectionResult,
  type PlannerSuggestionType,
} from "../types/planner.types";

function isDetectable(type: PlannerSuggestionType): boolean {
  return (DETECTABLE_SUGGESTION_TYPES as readonly PlannerSuggestionType[]).includes(type);
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** "Landlord · 500 EUR" — language-neutral, so it reads the same in en/ru/ro. */
export function formatMoneyNote(details: {
  amount?: number | null;
  currency?: string | null;
  providerName?: string | null;
}): string | undefined {
  const amount =
    typeof details.amount === "number" && Number.isFinite(details.amount) && details.amount > 0
      ? [String(details.amount), details.currency ?? ""].join(" ").trim()
      : undefined;
  const parts = [details.providerName ?? undefined, amount].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" · ") : undefined;
}

function joinDescription(...parts: (string | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join("\n")
    .slice(0, PLANNER_DESCRIPTION_MAX_LENGTH);
}

/**
 * Turn any suggestion the model proposed into one routeAccept can execute. A
 * retired financial type ("pay the rent") becomes a plain task carrying the due
 * date and amount; Tasks and Money do not bridge, so it never becomes a money draft.
 */
export function coerceDetectedSuggestion(suggestion: DetectedSuggestion): DetectedSuggestion {
  if (isDetectable(suggestion.suggestionType)) return suggestion;

  const payload = suggestion.proposedPayload ?? {};
  const amount = typeof payload.amount === "number" ? payload.amount : undefined;
  const description = joinDescription(
    suggestion.description ?? readString(payload, "description"),
    formatMoneyNote({
      amount,
      currency: readString(payload, "currency"),
      providerName: readString(payload, "providerName"),
    }),
  );
  const dueDate = readString(payload, "dueDate") ?? readString(payload, "financialDueDate");

  return {
    suggestionType: "create_task",
    title: suggestion.title,
    description: description || undefined,
    proposedPayload: {
      title: suggestion.title,
      description,
      ...(dueDate ? { dueDate } : {}),
      priority: readString(payload, "priority") ?? "medium",
    },
    confidence: suggestion.confidence,
  };
}

export function coerceDetection(result: PlannerIntentDetectionResult): PlannerIntentDetectionResult {
  return { ...result, suggestions: result.suggestions.map(coerceDetectedSuggestion) };
}
