import { describe, expect, it } from "vitest";
import { aiCategorySuggestionSchema } from "./ai-category-suggestion.schema";

const valid = {
  category_name: "Software / SaaS",
  type: "expense",
  merchant_name: "Google Ireland",
  confidence: 0.94,
  tags: ["subscription", "business_tool"],
  reasoning: "The merchant appears to be Google Ireland; likely cloud services.",
};

describe("aiCategorySuggestionSchema", () => {
  it("accepts a well-formed AI answer", () => {
    const parsed = aiCategorySuggestionSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("defaults tags when the model omits them", () => {
    const parsed = aiCategorySuggestionSchema.safeParse({ ...valid, tags: undefined });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tags).toEqual([]);
  });

  it("rejects out-of-range confidence", () => {
    expect(aiCategorySuggestionSchema.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
    expect(aiCategorySuggestionSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects unknown transaction types and missing fields", () => {
    expect(aiCategorySuggestionSchema.safeParse({ ...valid, type: "transfer" }).success).toBe(false);
    expect(aiCategorySuggestionSchema.safeParse({ ...valid, category_name: "" }).success).toBe(false);
    expect(aiCategorySuggestionSchema.safeParse({ ...valid, reasoning: undefined }).success).toBe(false);
  });

  it("allows a null merchant instead of an invented one", () => {
    const parsed = aiCategorySuggestionSchema.safeParse({ ...valid, merchant_name: null });
    expect(parsed.success).toBe(true);
  });
});
