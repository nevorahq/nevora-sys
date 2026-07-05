import { describe, it, expect } from "vitest";
import { normalizePlannerIntent } from "./normalize-planner-intent";
import { PLANNER_SUGGESTION_TYPES } from "../types/planner.types";

/**
 * The fallback normalizer is the money-safety backstop when AI is unavailable.
 * It must NEVER propose anything that could post a money transaction, and money
 * signals must route to the money-safe financial types.
 */
describe("normalizePlannerIntent", () => {
  it("defaults a plain thought to a create_task suggestion", () => {
    const result = normalizePlannerIntent("Call the accountant about Q3");
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestionType).toBe("create_task");
  });

  it("routes an invoice/payment thought to a money-safe financial type", () => {
    const result = normalizePlannerIntent("Pay the electricity bill 2026-07-20");
    expect(result.suggestions[0].suggestionType).toBe("create_money_reminder");
    expect(result.suggestions[0].proposedPayload.financialDueDate).toBe("2026-07-20");
  });

  it("routes a subscription thought to a subscription reminder", () => {
    const result = normalizePlannerIntent("Adobe subscription renews monthly, 20 EUR on 2026-08-10");
    expect(result.suggestions[0].suggestionType).toBe("create_subscription_reminder");
    expect(result.suggestions[0].proposedPayload.amount).toBe(20);
    expect(result.suggestions[0].proposedPayload.currency).toBe("EUR");
  });

  it("handles Russian financial phrasing", () => {
    const result = normalizePlannerIntent("Оплатить налог 2026-09-01");
    expect(["create_money_reminder", "create_subscription_reminder"]).toContain(
      result.suggestions[0].suggestionType,
    );
  });

  it("NEVER proposes a suggestion type outside the safe allow-list", () => {
    const inputs = [
      "Received 5000 EUR income today",
      "Paid 200 USD expense",
      "Post transaction to account",
      "Money in the bank",
    ];
    for (const input of inputs) {
      const result = normalizePlannerIntent(input);
      for (const s of result.suggestions) {
        expect(PLANNER_SUGGESTION_TYPES).toContain(s.suggestionType);
        // Money-safety: the type set has no transaction/expense/income producer.
        expect(s.suggestionType).not.toMatch(/transaction|expense|income|posted/);
      }
    }
  });

  it("flags missing information for financial input without a date", () => {
    const result = normalizePlannerIntent("Pay invoice to vendor");
    expect(result.missingInformation).toBeDefined();
    expect(result.missingInformation).toContain("payment_date");
  });
});
