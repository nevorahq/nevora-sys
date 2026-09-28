import { describe, it, expect } from "vitest";
import { normalizePlannerIntent } from "./normalize-planner-intent";
import { createTaskPayloadSchema, PLANNER_DESCRIPTION_MAX_LENGTH } from "../schemas/planner-suggestion.schema";
import { DETECTABLE_SUGGESTION_TYPES } from "../types/planner.types";

/**
 * The fallback normalizer runs when AI is unavailable. It must NEVER propose
 * anything that could post a money transaction, and every draft it produces must
 * be one routeAccept can execute — a payment thought becomes a plain task.
 */
describe("normalizePlannerIntent", () => {
  it("defaults a plain thought to a create_task suggestion", () => {
    const result = normalizePlannerIntent("Call the accountant about Q3");
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestionType).toBe("create_task");
    expect(result.missingInformation).toBeUndefined();
  });

  it("turns a payment thought into a task with its due date", () => {
    const result = normalizePlannerIntent("Pay the electricity bill 2026-07-20");
    expect(result.detectedIntent).toBe("payment");
    expect(result.suggestions[0].suggestionType).toBe("create_task");
    expect(result.suggestions[0].proposedPayload.dueDate).toBe("2026-07-20");
  });

  it("marks a subscription payment, still as a plain task", () => {
    const result = normalizePlannerIntent("Adobe subscription renews monthly, 20 EUR on 2026-08-10");
    expect(result.detectedIntent).toBe("subscription_payment");
    expect(result.suggestions[0].suggestionType).toBe("create_task");
  });

  it("handles Russian payment phrasing", () => {
    const result = normalizePlannerIntent("Оплатить налог 2026-09-01");
    expect(result.suggestions[0].suggestionType).toBe("create_task");
    expect(result.suggestions[0].proposedPayload.dueDate).toBe("2026-09-01");
  });

  it("only ever proposes a type routeAccept executes", () => {
    const inputs = [
      "Received 5000 EUR income today",
      "Paid 200 USD expense",
      "Post transaction to account",
      "Money in the bank",
      "Pay invoice to vendor",
    ];
    for (const input of inputs) {
      for (const s of normalizePlannerIntent(input).suggestions) {
        expect(DETECTABLE_SUGGESTION_TYPES).toContain(s.suggestionType);
      }
    }
  });

  it("flags a missing due date for a payment without one", () => {
    const result = normalizePlannerIntent("Pay invoice to vendor");
    expect(result.missingInformation).toContain("due_date");
  });

  it("keeps a long capture acceptable by the task payload schema", () => {
    const longCapture = `Follow up with the supplier\n${"details ".repeat(450)}`;
    const [suggestion] = normalizePlannerIntent(longCapture).suggestions;

    expect(String(suggestion.proposedPayload.description).length).toBeLessThanOrEqual(PLANNER_DESCRIPTION_MAX_LENGTH);
    expect(createTaskPayloadSchema.safeParse(suggestion.proposedPayload).success).toBe(true);
  });
});
