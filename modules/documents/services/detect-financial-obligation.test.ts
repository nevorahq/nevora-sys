import { describe, it, expect } from "vitest";
import { classifyFinancialDocumentType } from "./classify-financial-document";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";

function base(overrides: Partial<ExtractedFinancialDocument> = {}): ExtractedFinancialDocument {
  return {
    documentType: "invoice",
    merchant: { name: "Hetzner", taxId: null, address: null },
    transaction: { date: "2026-07-01", currency: "EUR", subtotal: null, tax: null, total: 29, paymentMethod: null, documentNumber: null },
    items: [],
    confidence: { overall: 0.9, merchant: 0.9, date: 0.9, total: 0.9, items: 0.9 },
    suggestedActions: [],
    obligation: null,
    ...overrides,
  };
}

describe("classifyFinancialDocumentType", () => {
  it("returns null for a plain paid receipt with no obligation", () => {
    expect(classifyFinancialDocumentType(base({ documentType: "receipt" }))).toBeNull();
  });

  it("classifies a structured hosting obligation", () => {
    const result = classifyFinancialDocumentType(
      base({
        obligation: {
          isFinancialObligation: true,
          obligationType: "hosting_payment",
          providerName: "Hetzner",
          paymentDueDate: "2026-08-15",
          nextPaymentDate: null,
          billingInterval: "monthly",
          confidence: 0.92,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.contextType).toBe("hosting_payment");
    expect(result?.recurring).toBe(true);
    expect(result?.financialDueDate).toBe("2026-08-15");
    expect(result?.amount).toBe(29);
    expect(result?.currency).toBe("EUR");
    expect(result?.confidence).toBeCloseTo(0.92);
  });

  it("falls back to nextPaymentDate when paymentDueDate is absent", () => {
    const result = classifyFinancialDocumentType(
      base({
        obligation: {
          isFinancialObligation: true,
          obligationType: "subscription_payment",
          providerName: "Figma",
          paymentDueDate: null,
          nextPaymentDate: "2026-09-01",
          billingInterval: "monthly",
          confidence: 0.8,
        },
      }),
    );
    expect(result?.financialDueDate).toBe("2026-09-01");
  });

  it("maps a one-off tax obligation as non-recurring", () => {
    const result = classifyFinancialDocumentType(
      base({
        obligation: {
          isFinancialObligation: true,
          obligationType: "tax_payment",
          providerName: "VAT",
          paymentDueDate: "2026-08-20",
          nextPaymentDate: null,
          billingInterval: "one_time",
          confidence: 0.88,
        },
      }),
    );
    expect(result?.contextType).toBe("tax_payment");
    expect(result?.recurring).toBe(false);
  });

  it("uses the heuristic fallback for an invoice suggesting a task", () => {
    const result = classifyFinancialDocumentType(
      base({ suggestedActions: [{ type: "create_task", reason: "unpaid invoice" }] }),
    );
    expect(result?.contextType).toBe("invoice_payment");
    // No explicit due date on the heuristic path.
    expect(result?.financialDueDate).toBeNull();
  });

  it("treats a link_subscription suggestion as recurring", () => {
    const result = classifyFinancialDocumentType(
      base({ suggestedActions: [{ type: "link_subscription", reason: "saas" }] }),
    );
    expect(result?.contextType).toBe("subscription_payment");
    expect(result?.recurring).toBe(true);
  });

  it("ignores malformed obligation dates", () => {
    const result = classifyFinancialDocumentType(
      base({
        obligation: {
          isFinancialObligation: true,
          obligationType: "invoice_payment",
          providerName: null,
          paymentDueDate: "15/08/2026",
          nextPaymentDate: null,
          billingInterval: "one_time",
          confidence: 0.9,
        },
      }),
    );
    expect(result?.financialDueDate).toBeNull();
  });
});
