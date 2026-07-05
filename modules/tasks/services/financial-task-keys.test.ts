import { describe, it, expect } from "vitest";
import {
  buildFinancialTaskTitle,
  buildFinancialObligationIdempotencyKey,
  buildFinancialTaskExpenseIdempotencyKey,
  buildFinancialTaskExpenseTitle,
} from "./financial-task-keys";

describe("buildFinancialTaskTitle", () => {
  it("builds context-appropriate titles", () => {
    expect(buildFinancialTaskTitle("hosting_payment", "Hetzner")).toBe("Pay Hetzner hosting");
    expect(buildFinancialTaskTitle("domain_renewal", "nevora.com")).toBe("Renew nevora.com domain");
    expect(buildFinancialTaskTitle("tax_payment", "VAT")).toBe("Prepare VAT payment");
    expect(buildFinancialTaskTitle("client_invoice_followup", "Acme")).toBe("Follow up Acme invoice");
    expect(buildFinancialTaskTitle("invoice_payment", "AWS")).toBe("Pay AWS invoice");
  });

  it("falls back to a generic provider when name is missing", () => {
    expect(buildFinancialTaskTitle("invoice_payment", null)).toBe("Pay obligation invoice");
    expect(buildFinancialTaskTitle("invoice_payment", "   ")).toBe("Pay obligation invoice");
  });

  it("truncates to 200 chars", () => {
    const title = buildFinancialTaskTitle("invoice_payment", "x".repeat(500));
    expect(title.length).toBe(200);
  });
});

describe("buildFinancialObligationIdempotencyKey", () => {
  it("is stable and deterministic for a document source", () => {
    const key = buildFinancialObligationIdempotencyKey("document", "doc-123");
    expect(key).toBe("financial_obligation:document:doc-123");
    expect(buildFinancialObligationIdempotencyKey("document", "doc-123")).toBe(key);
  });
});

describe("buildFinancialTaskExpenseIdempotencyKey", () => {
  it("keys the expense to the task", () => {
    expect(buildFinancialTaskExpenseIdempotencyKey("task-9")).toBe("financial_task:task-9:transaction");
  });
});

describe("buildFinancialTaskExpenseTitle", () => {
  it("renders provider + humanized context", () => {
    expect(buildFinancialTaskExpenseTitle("Hetzner", "hosting_payment")).toBe("Hetzner — hosting payment");
    expect(buildFinancialTaskExpenseTitle(null, "tax_payment")).toBe("Expense — tax payment");
  });
});
