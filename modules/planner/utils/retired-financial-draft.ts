import { PLANNER_DESCRIPTION_MAX_LENGTH } from "../schemas/planner-suggestion.schema";
import type { PlannerSuggestion } from "../types/planner.types";

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The task payload for a draft of a retired financial type (create_financial_task,
 * create_money_reminder, create_subscription_reminder). Financial Tasks were
 * removed and Tasks and Money do not bridge, so such a draft is accepted as the
 * plain task it describes: the payment date becomes the due date and the amount,
 * currency and payee go into the description ("Linella · 1070 MDL").
 */
export function retiredFinancialDraftToTaskPayload(
  suggestion: Pick<PlannerSuggestion, "title" | "description" | "proposed_payload">,
): Record<string, unknown> {
  const payload = suggestion.proposed_payload ?? {};
  const amount =
    typeof payload.amount === "number" && Number.isFinite(payload.amount) && payload.amount > 0
      ? [String(payload.amount), text(payload, "currency") ?? ""].join(" ").trim()
      : undefined;
  const moneyNote = [text(payload, "providerName"), amount].filter(Boolean).join(" · ") || undefined;
  const description = [suggestion.description?.trim() || text(payload, "description"), moneyNote]
    .filter(Boolean)
    .join("\n")
    .slice(0, PLANNER_DESCRIPTION_MAX_LENGTH);

  return {
    // The review form edits suggestion.title, not the payload, so it wins.
    title: suggestion.title,
    description,
    dueDate: text(payload, "financialDueDate") ?? text(payload, "dueDate"),
    priority: text(payload, "priority") ?? "medium",
    projectId: text(payload, "projectId"),
  };
}
