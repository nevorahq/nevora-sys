import { describe, it, expect } from "vitest";
import { coerceDetectedSuggestion, coerceDetection, formatMoneyNote } from "./coerce-detected-suggestion";
import { createTaskPayloadSchema } from "../schemas/planner-suggestion.schema";
import { FINANCIAL_SUGGESTION_TYPES, type DetectedSuggestion } from "../types/planner.types";

function suggestion(overrides: Partial<DetectedSuggestion>): DetectedSuggestion {
  return {
    suggestionType: "create_task",
    title: "Pay rent",
    proposedPayload: {},
    confidence: 0.8,
    ...overrides,
  };
}

describe("coerceDetectedSuggestion", () => {
  it("passes a task suggestion through untouched", () => {
    const task = suggestion({ proposedPayload: { title: "Pay rent", dueDate: "2026-10-01" } });
    expect(coerceDetectedSuggestion(task)).toBe(task);
  });

  it("turns an action item into a task, keeping its date and priority", () => {
    const coerced = coerceDetectedSuggestion(
      suggestion({
        suggestionType: "create_action_item",
        title: "Call the accountant about VAT",
        proposedPayload: { title: "Call the accountant about VAT", dueDate: "2026-10-02", priority: "low" },
      }),
    );
    expect(coerced.suggestionType).toBe("create_task");
    expect(coerced.proposedPayload).toMatchObject({ dueDate: "2026-10-02", priority: "low" });
  });

  it.each(FINANCIAL_SUGGESTION_TYPES)("turns a retired %s draft into an acceptable task", (type) => {
    const coerced = coerceDetectedSuggestion(
      suggestion({
        suggestionType: type,
        proposedPayload: {
          title: "Pay rent",
          financialDueDate: "2026-10-01",
          amount: 500,
          currency: "EUR",
          providerName: "Landlord",
        },
      }),
    );

    expect(coerced.suggestionType).toBe("create_task");
    expect(coerced.proposedPayload.dueDate).toBe("2026-10-01");
    expect(coerced.proposedPayload.description).toBe("Landlord · 500 EUR");
    expect(coerced.proposedPayload).not.toHaveProperty("amount");
    expect(createTaskPayloadSchema.safeParse(coerced.proposedPayload).success).toBe(true);
  });

  it("keeps the model's description ahead of the money note", () => {
    const coerced = coerceDetectedSuggestion(
      suggestion({
        suggestionType: "create_money_reminder",
        description: "Office rent for October",
        proposedPayload: { amount: 500, currency: "EUR" },
      }),
    );
    expect(coerced.description).toBe("Office rent for October\n500 EUR");
  });

  it("turns a model-invented link or project draft into a task instead of a dead end", () => {
    for (const type of ["link_entities", "create_project", "assign_project", "create_document"] as const) {
      expect(coerceDetectedSuggestion(suggestion({ suggestionType: type })).suggestionType).toBe("create_task");
    }
  });

  it("coerces every suggestion of a detection result", () => {
    const result = coerceDetection({
      detectedIntent: "payment",
      confidence: 0.8,
      suggestions: [suggestion({ suggestionType: "create_financial_task" }), suggestion({})],
    });
    expect(result.suggestions.map((s) => s.suggestionType)).toEqual(["create_task", "create_task"]);
  });
});

describe("formatMoneyNote", () => {
  it("omits what is missing", () => {
    expect(formatMoneyNote({})).toBeUndefined();
    expect(formatMoneyNote({ amount: 0, currency: "EUR" })).toBeUndefined();
    expect(formatMoneyNote({ providerName: "AWS" })).toBe("AWS");
    expect(formatMoneyNote({ amount: 20 })).toBe("20");
  });
});
