import { describe, expect, it } from "vitest";
import { classifyFinancialDocumentType } from "./classify-financial-document";
import { evaluateExtraction } from "./confidence-rules";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";

/**
 * The money-route invariant: a document has AT MOST ONE route to a posted
 * transaction.
 *
 *   unpaid invoice / renewal  -> obligation task  -> Mark as paid  -> expense
 *   receipt / payment confirm -> draft expense    -> Confirm       -> expense
 *
 * Running both is what let one invoice be booked twice (live smoke, 2026-07-14:
 * confirming the drafted expense AND marking the generated task paid produced two
 * posted 250 MDL transactions for the same document).
 *
 * runDocumentExtraction enforces the choice by consulting the obligation FIRST and
 * skipping the draft expense when the obligation actually created the task. These
 * tests pin the two pure classifiers that decision is built from.
 */

function extracted(overrides: Partial<ExtractedFinancialDocument> = {}): ExtractedFinancialDocument {
  return {
    documentType: "invoice",
    merchant: { name: "Orange Moldova SA", taxId: null },
    transaction: {
      total: 250,
      currency: "MDL",
      subtotal: 208.33,
      tax: 41.67,
      date: "2026-07-14",
      documentNumber: "OM-1",
      paymentMethod: null,
    },
    items: [],
    obligation: null,
    suggestedActions: [],
    confidence: { overall: 0.97, merchant: 0.97, total: 0.97, date: 0.97 },
    ...overrides,
  } as unknown as ExtractedFinancialDocument;
}

const unpaidInvoice = extracted({
  documentType: "invoice",
  obligation: {
    isFinancialObligation: true,
    obligationType: "invoice_payment",
    billingInterval: "one_time",
    providerName: "Orange Moldova SA",
    paymentDueDate: "2026-08-05",
    nextPaymentDate: null,
    confidence: 0.95,
  },
} as unknown as Partial<ExtractedFinancialDocument>);

const paidReceipt = extracted({
  documentType: "payment_confirmation",
  obligation: null,
  suggestedActions: [],
});

describe("money-route exclusivity", () => {
  it("treats an unpaid invoice as an obligation (task route), not an expense that happened", () => {
    const classification = classifyFinancialDocumentType(unpaidInvoice);

    expect(classification).not.toBeNull();
    expect(classification?.contextType).toBe("invoice_payment");
    // A due date + amount is what lets the obligation auto-create the task — which
    // is precisely when the draft-expense route must be suppressed.
    expect(classification?.financialDueDate).toBe("2026-08-05");
    expect(classification?.amount).toBe(250);
  });

  it("treats an already-settled document as an expense, with no obligation", () => {
    expect(classifyFinancialDocumentType(paidReceipt)).toBeNull();
    // ...so the draft-expense route is the only one left, and it is available.
    expect(evaluateExtraction(paidReceipt).createTransaction).toBe(true);
  });

  /**
   * Guards the regression directly: the draft-expense evaluator is type-blind (it
   * would happily draft an expense for an unpaid invoice), so the ONLY thing
   * standing between an invoice and a double booking is that extraction consults
   * the obligation first. If this ever starts returning false, the exclusivity in
   * runDocumentExtraction is what must keep holding.
   */
  it("documents that the expense evaluator alone would double-book an invoice", () => {
    expect(evaluateExtraction(unpaidInvoice).createTransaction).toBe(true);
    expect(classifyFinancialDocumentType(unpaidInvoice)).not.toBeNull();
    // Both routes say "yes" — extraction must pick exactly one (the obligation).
  });
});
