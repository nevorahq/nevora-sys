import { beforeEach, describe, expect, it, vi } from "vitest";

const emitDomainEvent = vi.fn();
const createActionItemForDocument = vi.fn();
const createDocumentSuggestionWithClassification = vi.fn();
const normalizeFinancialDocument = vi.fn();
const routeExtraction = vi.fn();
const canUseFeatureForOrganization = vi.fn();
const assertPlanLimit = vi.fn();
const findDocumentCapture = vi.fn();
const proposeTasksFromDocumentCapture = vi.fn();

vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/modules/planner/services/propose-tasks-from-document-capture", () => ({
  findDocumentCapture,
  proposeTasksFromDocumentCapture,
}));
vi.mock("@/modules/action-center/services/create-action-item-for-document", () => ({
  createActionItemForDocument,
}));
vi.mock("@/modules/review/services/financial-suggestion.service", () => ({
  createDocumentSuggestionWithClassification,
}));
vi.mock("@/modules/ai/services/normalize-financial-document", () => ({ normalizeFinancialDocument }));
vi.mock("@/modules/billing", () => ({ canUseFeatureForOrganization, assertPlanLimit }));
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
  createActionItemForDocument.mockResolvedValue(undefined);
  createDocumentSuggestionWithClassification.mockResolvedValue({
    ok: true,
    data: { suggestion: { id: "sug-1" } },
  });
  canUseFeatureForOrganization.mockResolvedValue(true);
  assertPlanLimit.mockResolvedValue(undefined);
  routeExtraction.mockResolvedValue({
    ok: true,
    provider: "pdf_parse",
    rawText: "raw",
    normalization: { kind: "text", text: "raw" },
  });
  normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted });
  findDocumentCapture.mockResolvedValue(null);
  proposeTasksFromDocumentCapture.mockResolvedValue(0);
});

// ADR 002, step 0.3: a non-financial document captured in the Inbox becomes task
// drafts on its capture — never an expense draft, and no generic review item.
describe("runDocumentExtraction — work route for captured non-financial documents", () => {
  const capture = { id: "entry-1", source_document_id: DOC_ID };
  const note = {
    ...extracted,
    documentType: "unknown",
    visibleText: "Sign the lease by Friday. Call the notary.",
    transaction: { ...extracted.transaction, total: null, subtotal: null, tax: null },
    items: [],
    confidence: { overall: 0.9 },
  };

  it("turns a captured note into task drafts, ready for review, with no expense draft", async () => {
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: note });
    findDocumentCapture.mockResolvedValue(capture);
    proposeTasksFromDocumentCapture.mockResolvedValue(2);

    const result = await runDocumentExtraction(makeSupabase(infra()), ctx, DOC_ID, EXT_ID);

    expect(result.status).toBe("completed");
    expect(proposeTasksFromDocumentCapture).toHaveBeenCalledWith(expect.anything(), ctx, capture, "raw");
    expect(createDocumentSuggestionWithClassification).not.toHaveBeenCalled();
    expect(createActionItemForDocument).not.toHaveBeenCalled();
  });

  it("reads an image's text from the transcription, since an image has no text layer", async () => {
    routeExtraction.mockResolvedValue({
      ok: true,
      provider: "anthropic_vision",
      rawText: null,
      normalization: { kind: "image", base64: "x", mediaType: "image/png" },
    });
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: note });
    findDocumentCapture.mockResolvedValue(capture);
    proposeTasksFromDocumentCapture.mockResolvedValue(1);

    await runDocumentExtraction(makeSupabase(infra()), ctx, DOC_ID, EXT_ID);

    expect(proposeTasksFromDocumentCapture).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      capture,
      "Sign the lease by Friday. Call the notary.",
    );
  });

  it("falls back to a document review when the note asks for no action", async () => {
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: note });
    findDocumentCapture.mockResolvedValue(capture);
    proposeTasksFromDocumentCapture.mockResolvedValue(0);

    const result = await runDocumentExtraction(makeSupabase(infra()), ctx, DOC_ID, EXT_ID);

    expect(result.status).toBe("needs_review");
    expect(createActionItemForDocument).toHaveBeenCalledTimes(1);
  });

  it("leaves a plain upload (no Inbox capture) on the existing route", async () => {
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: note });

    await runDocumentExtraction(makeSupabase(infra()), ctx, DOC_ID, EXT_ID);

    expect(proposeTasksFromDocumentCapture).not.toHaveBeenCalled();
    expect(createActionItemForDocument).toHaveBeenCalledTimes(1);
  });

  it("never looks for task work in a financial document", async () => {
    findDocumentCapture.mockResolvedValue(capture);

    const result = await runDocumentExtraction(makeSupabase(infra()), ctx, DOC_ID, EXT_ID);

    expect(findDocumentCapture).not.toHaveBeenCalled();
    expect(proposeTasksFromDocumentCapture).not.toHaveBeenCalled();
    expect(result.suggestionId).toBe("sug-1");
  });
});

describe("runDocumentExtraction — persistence failures", () => {
  it("fails the run when the header upsert fails — never marks completed, never creates a suggestion", async () => {
    const supabase = makeSupabase(infra({ header: { error: { message: "header boom" } } }));

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("unknown_error");
    expect(createDocumentSuggestionWithClassification).not.toHaveBeenCalled();
  });

  it("downgrades to needs_review when line items fail to persist, but still creates the suggestion", async () => {
    const supabase = makeSupabase(infra({ items: { error: { message: "items boom" } } }));

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("needs_review");
    expect(createDocumentSuggestionWithClassification).toHaveBeenCalledTimes(1);
  });

  it("completes a fully-persisted high-confidence extraction and creates a review suggestion only", async () => {
    const supabase = makeSupabase(infra());

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.transactionId).toBeNull();
    expect(result.suggestionId).toBe("sug-1");
    expect(createDocumentSuggestionWithClassification).toHaveBeenCalledTimes(1);
    expect(createDocumentSuggestionWithClassification).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        documentId: DOC_ID,
        extractionId: EXT_ID,
        vendorName: "Acme",
        amount: 99.5,
        currency: "EUR",
        issueDate: "2026-06-01",
        documentType: "invoice",
      }),
    );
  });
});

// Phase D §8: the feature gate + usage check must run BEFORE the expensive OCR/AI
// step, never as a cleanup after it. These pin that a blocked plan (a) short-circuits
// with a usage_limit_exceeded outcome, (b) leaves the document retryable
// (needs_review, not failed — so an upgrade lets the same document proceed), and
// (c) never spends an extraction/AI call. Without them the wiring exists but nothing
// proves it actually stops the costly work.
describe("runDocumentExtraction — plan enforcement runs before any OCR", () => {
  it("refuses when documents.process is not in the plan, and never routes extraction", async () => {
    canUseFeatureForOrganization.mockResolvedValue(false);
    const supabase = makeSupabase(infra());

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    // The gate reads through the caller's client, so it also holds for the
    // sessionless callers (the extraction sweep, a channel webhook).
    expect(canUseFeatureForOrganization).toHaveBeenCalledWith(ORG_ID, "documents.process", supabase);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("usage_limit_exceeded");
    // Retryable, not a hard failure: an upgrade should let this document proceed.
    expect(result.status).toBe("needs_review");
    // The costly step never ran, and the usage counter was never consulted once the
    // feature gate said no.
    expect(routeExtraction).not.toHaveBeenCalled();
    expect(assertPlanLimit).not.toHaveBeenCalled();
  });

  it("refuses when the monthly processing quota is exhausted, and never routes extraction", async () => {
    assertPlanLimit.mockRejectedValue(new Error("Document processing limit reached."));
    const supabase = makeSupabase(infra());

    const result = await runDocumentExtraction(supabase, ctx, DOC_ID, EXT_ID);

    expect(assertPlanLimit).toHaveBeenCalledWith(ORG_ID, "documents_processed.monthly", 1, supabase);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("usage_limit_exceeded");
    expect(result.status).toBe("needs_review");
    expect(routeExtraction).not.toHaveBeenCalled();
  });
});

// Inbox Scan mode: a QR code scanned with the photo is handed to the model and
// its header values win over what the model read.
describe("runDocumentExtraction — scanned code", () => {
  const withCode = (raw: string | null) => {
    const base = infra();
    return (table: string, op: string, kind: string) =>
      table === "documents"
        ? { data: { id: DOC_ID, title: "Scan", doc_type: "unknown", capture_code: raw ? { raw, format: "qr_code" } : null }, error: null }
        : base(table, op, kind);
  };

  it("passes the code to the model and lets its amount win, flagging the mismatch", async () => {
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: structuredClone(extracted) });
    const epc = "BCD\n002\n1\nSCT\n\nAcme GmbH\nDE89370400440532013000\nEUR100.00";

    await runDocumentExtraction(makeSupabase(withCode(epc)), ctx, DOC_ID, EXT_ID);

    const hint = normalizeFinancialDocument.mock.calls[0][1]?.hint as string;
    expect(hint).toContain("kind: epc_payment");
    expect(hint).toContain("amount: 100");
    expect(createDocumentSuggestionWithClassification).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      expect.objectContaining({
        amount: 100,
        metadata: expect.objectContaining({
          capture_code_kind: "epc_payment",
          code_mismatches: ["amount"],
          needs_field_review: true,
        }),
      }),
    );
  });

  it("extracts as before when the capture carries no code", async () => {
    normalizeFinancialDocument.mockResolvedValue({ ok: true, raw: {}, extracted: structuredClone(extracted) });

    await runDocumentExtraction(makeSupabase(withCode(null)), ctx, DOC_ID, EXT_ID);

    expect(normalizeFinancialDocument.mock.calls[0][1]).toEqual({ hint: null });
    const metadata = createDocumentSuggestionWithClassification.mock.calls[0][2].metadata;
    expect(metadata).not.toHaveProperty("capture_code_kind");
    expect(createDocumentSuggestionWithClassification.mock.calls[0][2].amount).toBe(99.5);
  });
});
