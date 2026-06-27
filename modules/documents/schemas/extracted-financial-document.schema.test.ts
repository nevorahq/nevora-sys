import { describe, it, expect } from "vitest";
import { ExtractedFinancialDocumentSchema } from "./extracted-financial-document.schema";

const VALID = {
  documentType: "receipt",
  merchant: { name: "Figma", taxId: null, address: null },
  transaction: { date: "2026-06-01", currency: "EUR", subtotal: 12, tax: 3, total: 15, paymentMethod: "card" },
  items: [{ name: "Pro plan", quantity: 1, unitPrice: 15, totalPrice: 15, taxRate: 0.2, category: "software" }],
  confidence: { overall: 0.9, merchant: 0.95, date: 0.9, total: 0.95, items: 0.8 },
  suggestedActions: [{ type: "create_transaction", reason: "clear receipt" }],
};

describe("ExtractedFinancialDocumentSchema", () => {
  it("accepts a well-formed model output", () => {
    const parsed = ExtractedFinancialDocumentSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("defaults currency, items and suggestedActions when omitted", () => {
    const parsed = ExtractedFinancialDocumentSchema.safeParse({
      documentType: "unknown",
      merchant: { name: null, taxId: null, address: null },
      transaction: { date: null, subtotal: null, tax: null, total: null, paymentMethod: null },
      confidence: { overall: 0.2, merchant: 0.2, date: 0.2, total: 0.2, items: 0.2 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.transaction.currency).toBe("EUR");
      expect(parsed.data.items).toEqual([]);
      expect(parsed.data.suggestedActions).toEqual([]);
    }
  });

  it("rejects confidence outside 0..1", () => {
    const bad = { ...VALID, confidence: { ...VALID.confidence, overall: 1.4 } };
    expect(ExtractedFinancialDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown document type", () => {
    const bad = { ...VALID, documentType: "bank_statement" };
    expect(ExtractedFinancialDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown suggested action type", () => {
    const bad = { ...VALID, suggestedActions: [{ type: "delete_everything", reason: "no" }] };
    expect(ExtractedFinancialDocumentSchema.safeParse(bad).success).toBe(false);
  });
});
