import { beforeEach, describe, expect, it, vi } from "vitest";

const emitDomainEvent = vi.fn();
const createEntityLink = vi.fn();
const createDraftTransactionFromDocument = vi.fn();
const createActionItemForDocument = vi.fn();
const normalizeFinancialDocument = vi.fn();
const routeExtraction = vi.fn();
const classifyExpense = vi.fn();
const recordClassificationDecision = vi.fn();

vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/lib/entity-links", () => ({ createEntityLink }));
vi.mock("@/modules/moneyflow/services/create-draft-transaction-from-document", () => ({
  createDraftTransactionFromDocument,
}));
vi.mock("@/modules/action-center/services/create-action-item-for-document", () => ({
  createActionItemForDocument,
}));
vi.mock("@/modules/ai/services/normalize-financial-document", () => ({ normalizeFinancialDocument }));
vi.mock("@/modules/moneyflow/services/expense-classifier", () => ({
  classifyExpense,
  recordClassificationDecision,
}));
vi.mock("./document-extraction-router", () => ({ routeExtraction }));

const { runDocumentExtraction } = await import("./document-extraction-service");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "44444444-4444-4444-8444-444444444444";
const EXT_ID = "ext-1";

const ctx = { org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: "u" } } as never;

const extracted = {
  documentType: "invoice",
  merchant: { name: "Acme", taxId: null },
  transaction: {
    documentNumber: null,
    date: "2026-06-01",
    currency: "EUR",
    subtotal: 80,
    tax: 19.5,
    total: 99.5,
    paymentMethod: null,
  },
  items: [{ name: "Widget", quantity: 1, unitPrice: 99.5, totalPrice: 99.5, taxRate: null }],
  confidence: { overall: 0.95 },
};

/** Terminal-aware Supabase mock. `resolver(table, op, kind)` resolves each query. */
let calls: string[];

function makeSupabase(resolver: (table: string, op: string, kind: string) => unknown) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    const setOp = (o: string) => {
      state.op = o;
      return builder;
    };
    builder.insert = vi.fn(() => setOp("insert"));
    builder.update = vi.fn(() => setOp("update"));
    builder.delete = vi.fn(() => setOp("delete"));
    builder.upsert = vi.fn(() => setOp("upsert"));
    builder.select = vi.fn(() => builder);
    for (const m of ["eq", "is", "in", "neq", "order", "limit", "gte", "lte", "not"]) {
      builder[m] = vi.fn(() => builder);
    }
    const term = (kind: string) => () => {
      calls.push(`${table}:${state.op}:${kind}`);
      return Promise.resolve(resolver(table, state.op, kind));
    };
    builder.maybeSingle = vi.fn(term("maybeSingle"));
    builder.single = vi.fn(term("single"));
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term("await")().then(res, rej);
    return builder;
  });
  const storage = {
    from: vi.fn(() => ({
      download: vi.fn(() =>
        Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }, error: null }),
      ),
    })),
  };
  return { from, storage } as never;
}

/** Infra resolver with toggleable header/items persistence results. */
function infra(opts: { header?: unknown; items?: unknown } = {}) {
  const header = opts.header ?? { error: null };
  const items = opts.items ?? { error: null };
  return (table: string, op: string, kind: string) => {
    if (table === "document_extractions" && kind === "maybeSingle") return { data: { id: EXT_ID }, error: null };
    if (table === "documents") return { data: { id: DOC_ID, title: "Invoice", doc_type: "invoice" }, error: null };
    if (table === "document_attachments")
      return {
        data: { id: "a", file_path: "p", extension: "pdf", mime_type: "application/pdf", client_mime_type: null },
        error: null,
      };
    if (table === "ai_requests" && op === "insert") return { data: { id: "ai-1" }, error: null };
    if (table === "financial_document_data") return header;
    if (table === "financial_document_items") return items;
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  emitDomainEvent.mockResolvedValue(undefined);
  createEntityLink.mockResolvedValue({ ok: true });
  createActionItemForDocument.mockResolvedValue(undefined);
  createDraftTransactionFromDocument.mockResolvedValue({ ok: true, transactionId: "tx-1", duplicateOfId: null });
  classifyExpense.mockResolvedValue({
    normalizedMerchant: "acme",
    categoryId: "category-1",
    expenseContextId: "context-1",
    visibility: "organization",
    ownerUserId: null,
    categoryConfidence: 0.8,
    contextConfidence: 0.55,
    method: "system_rule",
    reason: "Matched a built-in rule.",
    matchedSignals: ["merchant"],
    classifierVersion: "smart-categories-v1",
  });
  recordClassificationDecision.mockResolvedValue(undefined);
  routeExtraction.mockResolvedValue({
    ok: true,
    provider: "pdf_parse",
    rawText: "raw",
    normalization: { kind: "text", text: "raw" },
  });
  normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted });
});

describe("runDocumentExtraction — persistence failures", () => {
  it("fails the run when the header upsert fails — never marks completed, never drafts a transaction", async () => {
    const supabase = makeSupabase(infra({ header: { error: { message: "header boom" } } }));

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("unknown_error");
    expect(createDraftTransactionFromDocument).not.toHaveBeenCalled();
  });

  it("downgrades to needs_review when line items fail to persist, but still drafts the transaction", async () => {
    const supabase = makeSupabase(infra({ items: { error: { message: "items boom" } } }));

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("needs_review");
    expect(createDraftTransactionFromDocument).toHaveBeenCalledTimes(1);
  });

  it("completes a fully-persisted high-confidence extraction and drafts the transaction", async () => {
    const supabase = makeSupabase(infra());

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.transactionId).toBe("tx-1");
    expect(createDraftTransactionFromDocument).toHaveBeenCalledTimes(1);
    expect(createDraftTransactionFromDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        categoryId: "category-1",
        expenseContextId: "context-1",
        visibility: "organization",
      }),
    );
    expect(recordClassificationDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "tx-1",
      expect.objectContaining({ method: "system_rule" }),
    );
  });
});
