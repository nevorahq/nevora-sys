import { describe, it, expect } from "vitest";
import {
  PLANNER_SUGGESTION_TYPES,
  FINANCIAL_SUGGESTION_TYPES,
  isFinancialSuggestionType,
  confidenceBand,
} from "./planner.types";

describe("planner money-safety invariants", () => {
  it("exposes NO suggestion type that could post a money transaction", () => {
    // Capture Inbox may only ever create tasks / reminders / links / action items.
    // A regression that adds a 'post_transaction'-style type must fail this test.
    for (const type of PLANNER_SUGGESTION_TYPES) {
      expect(type).not.toMatch(/transaction|posted|income|expense_posted|payment_record/);
    }
  });

  it("classifies every financial type as financial (routes to the money-safe service)", () => {
    for (const type of FINANCIAL_SUGGESTION_TYPES) {
      expect(isFinancialSuggestionType(type)).toBe(true);
    }
    expect(isFinancialSuggestionType("create_task")).toBe(false);
    expect(isFinancialSuggestionType("link_entities")).toBe(false);
  });

  it("applies the confidence bands from the spec (0.85 / 0.60)", () => {
    expect(confidenceBand(0.9)).toBe("ready");
    expect(confidenceBand(0.85)).toBe("ready");
    expect(confidenceBand(0.7)).toBe("needs_review");
    expect(confidenceBand(0.6)).toBe("needs_review");
    expect(confidenceBand(0.4)).toBe("insufficient");
  });
});
