import { describe, it, expect } from "vitest";
import {
  evaluateExtraction,
  hasRequiredTransactionFields,
  CONFIDENCE_AUTO_DRAFT,
  CONFIDENCE_REVIEW_FLOOR,
} from "./confidence-rules";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";

function makeExtraction(overrides: {
  overall: number;
  total?: number | null;
  currency?: string;
}): ExtractedFinancialDocument {
  return {
    documentType: "receipt",
    merchant: { name: "Figma", taxId: null, address: null },
    transaction: {
      date: "2026-06-01",
      currency: overrides.currency ?? "EUR",
      subtotal: null,
      tax: null,
      total: overrides.total === undefined ? 15 : overrides.total,
      paymentMethod: "card",
      documentNumber: null,
    },
    items: [],
    confidence: {
      overall: overrides.overall,
      merchant: overrides.overall,
      date: overrides.overall,
      total: overrides.overall,
      items: overrides.overall,
    },
    suggestedActions: [],
  };
}

describe("hasRequiredTransactionFields", () => {
  it("requires a positive total and a currency", () => {
    expect(hasRequiredTransactionFields(makeExtraction({ overall: 0.9 }))).toBe(true);
    expect(hasRequiredTransactionFields(makeExtraction({ overall: 0.9, total: null }))).toBe(false);
    expect(hasRequiredTransactionFields(makeExtraction({ overall: 0.9, total: 0 }))).toBe(false);
    expect(hasRequiredTransactionFields(makeExtraction({ overall: 0.9, currency: "" }))).toBe(false);
  });
});

describe("evaluateExtraction", () => {
  it("high confidence (>=0.85) → draft + confirm action, no field review", () => {
    const d = evaluateExtraction(makeExtraction({ overall: CONFIDENCE_AUTO_DRAFT }));
    expect(d.createTransaction).toBe(true);
    expect(d.extractionStatus).toBe("completed");
    expect(d.actionItemType).toBe("draft_review");
    expect(d.requiresFieldReview).toBe(false);
  });

  it("medium confidence (0.65–0.85) → draft + needs_review + field review", () => {
    const d = evaluateExtraction(makeExtraction({ overall: CONFIDENCE_REVIEW_FLOOR }));
    expect(d.createTransaction).toBe(true);
    expect(d.extractionStatus).toBe("needs_review");
    expect(d.actionItemType).toBe("draft_review");
    expect(d.requiresFieldReview).toBe(true);
  });

  it("low confidence (<0.65) → NO transaction, document review", () => {
    const d = evaluateExtraction(makeExtraction({ overall: 0.5 }));
    expect(d.createTransaction).toBe(false);
    expect(d.extractionStatus).toBe("needs_review");
    expect(d.actionItemType).toBe("document_review");
  });

  it("missing required fields → never drafts even at high confidence", () => {
    const d = evaluateExtraction(makeExtraction({ overall: 0.99, total: null }));
    expect(d.createTransaction).toBe(false);
    expect(d.actionItemType).toBe("document_review");
  });
});
