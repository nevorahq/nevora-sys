import { describe, it, expect } from "vitest";
import {
  detectedSuggestionSchema,
  financialTaskPayloadSchema,
  createTaskPayloadSchema,
  acceptPlannerSuggestionSchema,
  editPlannerSuggestionSchema,
} from "./planner-suggestion.schema";

describe("planner suggestion schemas", () => {
  it("rejects an AI suggestion with an unknown type (fails safely)", () => {
    const result = detectedSuggestionSchema.safeParse({
      suggestionType: "post_money_transaction",
      title: "x",
      confidence: 0.9,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid detected suggestion", () => {
    const result = detectedSuggestionSchema.safeParse({
      suggestionType: "create_task",
      title: "Do the thing",
      confidence: 0.7,
      proposedPayload: { title: "Do the thing" },
    });
    expect(result.success).toBe(true);
  });

  it("financial payload requires a payment date (money-safe gate)", () => {
    const result = financialTaskPayloadSchema.safeParse({
      title: "Pay invoice",
      amount: 100,
      currency: "EUR",
    });
    expect(result.success).toBe(false);
  });

  it("financial payload uppercases the currency and allows no amount", () => {
    const result = financialTaskPayloadSchema.safeParse({
      title: "Renew domain",
      financialDueDate: "2026-07-20",
      currency: "eur",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("EUR");
      expect(result.data.amount ?? null).toBeNull();
    }
  });

  it("createTask payload defaults priority to medium", () => {
    const result = createTaskPayloadSchema.safeParse({ title: "hi" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe("medium");
  });

  it("accept schema requires a uuid", () => {
    expect(acceptPlannerSuggestionSchema.safeParse({ suggestionId: "nope" }).success).toBe(false);
    expect(
      acceptPlannerSuggestionSchema.safeParse({
        suggestionId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("edit schema only accepts whitelisted fields", () => {
    const result = editPlannerSuggestionSchema.safeParse({
      suggestionId: "11111111-1111-4111-8111-111111111111",
      title: "New title",
      // Extra field must be stripped by zod, never surfaced on parsed data.
      organization_id: "should-be-ignored",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
    }
  });
});
