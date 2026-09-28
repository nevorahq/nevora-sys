import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  audit: vi.fn(),
  state: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ emitAuditLog: mocks.audit }));
vi.mock("@/modules/review/services/financial-suggestion.service", () => ({
  confirmFinancialSuggestionRecord: mocks.confirm,
}));
vi.mock("../queries/get-document-extraction", () => ({ getDocumentExtractionState: mocks.state }));

import { getReceiptReview, saveReviewedReceipt } from "./receipt-review-service";

const DOC = "0f5b3a8e-6a39-4d0e-9d7e-6f3a2b1c0d11";
const SUGGESTION = "7b113e6e-c727-4308-baf9-c8f813ece4d5";
const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } } as unknown as CurrentContext;

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

/** A chainable Supabase stand-in: records every write, answers reads per table. */
function fakeSupabase(reads: Record<string, unknown>, failOn: string | null = null) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const result = () => ({
      data: call.op === "select" ? (reads[table] ?? null) : null,
      error: failOn === `${table}.${call.op}` ? { message: "boom" } : null,
    });
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "is"]) builder[method] = () => builder;
    builder.eq = (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return builder;
    };
    for (const op of ["update", "delete", "insert"]) {
      builder[op] = (payload?: unknown) => {
        call.op = op;
        call.payload = payload;
        calls.push(call);
        return builder;
      };
    }
    builder.maybeSingle = async () => result();
    builder.then = (resolve: (value: unknown) => void) => resolve(result());
    return builder;
  };
  return {
    client: {
      from,
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed/photo" } }) }) },
    } as unknown as SupabaseClient,
    calls,
  };
}

const input = {
  documentId: DOC,
  suggestionId: SUGGESTION,
  vendorName: "Linella",
  merchantTaxId: null,
  transactionDate: "2026-09-28",
  currency: "MDL",
  amount: 245.5,
  items: [{ name: "Pâine", quantity: 2, unitPrice: 10, totalPrice: 20 }],
  accountId: undefined,
  categoryId: null,
  expenseContextId: null,
  rememberChoice: false,
};

describe("saveReviewedReceipt", () => {
  beforeEach(() => {
    mocks.confirm.mockReset();
    mocks.audit.mockReset();
  });

  it("saves the corrected header and items, then posts through the existing confirm", async () => {
    const { client, calls } = fakeSupabase({
      financial_suggestions: { id: SUGGESTION, source_id: DOC, review_state: "waiting_confirmation", metadata: { extraction_id: "ex-1" } },
    });
    mocks.confirm.mockResolvedValue({ ok: true, data: { transactionId: "tx-1", alreadyConfirmed: false } });

    const result = await saveReviewedReceipt(client, ctx, input);

    expect(result).toEqual({ ok: true, transactionId: "tx-1", alreadyConfirmed: false });
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      "financial_document_data.update",
      "financial_document_items.delete",
      "financial_document_items.insert",
    ]);
    expect(calls[2].payload).toEqual([
      expect.objectContaining({ document_id: DOC, extraction_id: "ex-1", name: "Pâine", quantity: 2, unit_price: 10, total_price: 20 }),
    ]);
    // Every write is scoped to the caller's organization: filters on update and
    // delete, the column itself on insert.
    expect(calls[0].filters).toContainEqual(["organization_id", "org-1"]);
    expect(calls[1].filters).toContainEqual(["organization_id", "org-1"]);
    expect(calls[2].payload).toEqual([expect.objectContaining({ organization_id: "org-1", workspace_id: "ws-1" })]);
    expect(mocks.confirm).toHaveBeenCalledWith(client, ctx, expect.objectContaining({
      suggestionId: SUGGESTION,
      vendorName: "Linella",
      amount: 245.5,
      currency: "MDL",
      transactionDate: "2026-09-28",
    }));
  });

  it("returns the existing transaction for an already confirmed receipt without writing", async () => {
    const { client, calls } = fakeSupabase({
      financial_suggestions: { id: SUGGESTION, source_id: DOC, review_state: "confirmed", created_transaction_id: "tx-0", metadata: {} },
    });
    expect(await saveReviewedReceipt(client, ctx, input)).toEqual({ ok: true, transactionId: "tx-0", alreadyConfirmed: true });
    expect(calls).toEqual([]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses a rejected receipt and one that is not this document's draft", async () => {
    const rejected = fakeSupabase({
      financial_suggestions: { id: SUGGESTION, source_id: DOC, review_state: "rejected", metadata: {} },
    });
    expect(await saveReviewedReceipt(rejected.client, ctx, input)).toMatchObject({ ok: false, code: "handled" });

    const missing = fakeSupabase({});
    expect(await saveReviewedReceipt(missing.client, ctx, input)).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("does not post when the corrections could not be saved", async () => {
    const { client } = fakeSupabase(
      { financial_suggestions: { id: SUGGESTION, source_id: DOC, review_state: "waiting_confirmation", metadata: {} } },
      "financial_document_items.delete",
    );
    expect(await saveReviewedReceipt(client, ctx, input)).toMatchObject({ ok: false, code: "failed" });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("passes a currency mismatch through as its own code", async () => {
    const { client } = fakeSupabase({
      financial_suggestions: { id: SUGGESTION, source_id: DOC, review_state: "suggested", metadata: {} },
    });
    mocks.confirm.mockResolvedValue({ ok: false, error: "Pick an MDL account", code: "currency_mismatch" });
    expect(await saveReviewedReceipt(client, ctx, input)).toMatchObject({ ok: false, code: "currency_mismatch" });
  });
});

describe("getReceiptReview", () => {
  const baseState = {
    extraction: { status: "completed", error_code: null },
    financialData: { merchant_name: "Linella", merchant_tax_id: "1003600", transaction_date: "2026-09-28", currency: "MDL", total_amount: 245.5 },
    items: [{ name: "Lapte", quantity: 1, unit_price: 25, total_price: 25 }],
    financialSuggestion: null,
    accounts: [],
    categories: [],
    contexts: [],
    classification: null,
  };

  it.each([
    [{ ...baseState, extraction: null }, "processing"],
    [{ ...baseState, extraction: { status: "processing", error_code: null } }, "processing"],
    [{ ...baseState, extraction: { status: "failed", error_code: "ocr_failed" } }, "failed"],
    [baseState, "no_draft"],
    [{ ...baseState, financialSuggestion: { id: SUGGESTION, review_state: "waiting_confirmation", metadata: {} } }, "ready"],
    [{ ...baseState, financialSuggestion: { id: SUGGESTION, review_state: "confirmed", created_transaction_id: "tx", metadata: {} } }, "confirmed"],
  ])("maps extraction state to %#", async (state, status) => {
    mocks.state.mockResolvedValue(state);
    const { client } = fakeSupabase({ documents: { id: DOC }, document_attachments: { file_path: "p/receipt.jpg", extension: "jpg" } });
    const review = await getReceiptReview(client, ctx, DOC);
    expect(review?.status).toBe(status);
    expect(review?.photoUrl).toBe("https://signed/photo");
  });

  it("reads code mismatches from the draft and ignores junk", async () => {
    mocks.state.mockResolvedValue({
      ...baseState,
      financialSuggestion: {
        id: SUGGESTION,
        review_state: "waiting_confirmation",
        amount: 245.5,
        currency: "MDL",
        metadata: { capture_code_kind: "md_fiscal", code_mismatches: ["amount", "bogus"], duplicate_of: "tx-9" },
      },
    });
    const { client } = fakeSupabase({ documents: { id: DOC }, document_attachments: { file_path: "p/scan.pdf", extension: "pdf" } });
    const review = await getReceiptReview(client, ctx, DOC);
    expect(review).toMatchObject({ scanned: true, codeMismatches: ["amount"], possibleDuplicate: true, photoUrl: null });
    expect(review?.items).toEqual([{ name: "Lapte", quantity: 1, unitPrice: 25, totalPrice: 25 }]);
  });

  it("returns null for a document outside the organization", async () => {
    const { client } = fakeSupabase({});
    expect(await getReceiptReview(client, ctx, DOC)).toBeNull();
  });
});
