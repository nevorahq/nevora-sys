import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

// ── Mocked collaborators (real: validate/record/storage-path/schema) ─────────
const after = vi.fn();
const requireAppAccess = vi.fn();
const createClient = vi.fn();
const getBlockedReason = vi.fn(async () => null as { message: string } | null);
const assertWithinLimit = vi.fn(async () => undefined);
const reserveOrganizationUsage = vi.fn(async () => undefined);
const releaseOrganizationUsage = vi.fn(async () => undefined);
const emitDomainEvent = vi.fn(async () => undefined);
const emitAuditLog = vi.fn(async () => undefined);
const enqueueDocumentExtraction = vi.fn(async () => ({ ok: false, reason: "no_attachment", message: "" }));
const runDocumentExtraction = vi.fn(async () => ({ ok: true }));

vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/security", () => ({
  requireAppAccess,
  redactFilenameForEvent: (name: string) => name,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/modules/billing", () => ({
  featureGateService: { getBlockedReason },
  usageService: { assertWithinLimit },
  reserveOrganizationUsage,
  releaseOrganizationUsage,
}));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("@/lib/observability/report-error", () => ({
  reportError: () => ({ message: "The upload could not be completed.", diagnosticId: "diag-1" }),
}));
vi.mock("./document-extraction-service", () => ({ enqueueDocumentExtraction, runDocumentExtraction }));

const { createDocumentWithAttachments } = await import("./document-upload-service");

const DOC_ID = "11111111-1111-4111-8111-111111111111";

function ctxWith(perms: string[]): CurrentContext {
  return {
    org: { id: "org-1" },
    workspace: { id: "ws-1" },
    user: { id: "user-1" },
    permissions: new Set(perms),
  } as unknown as CurrentContext;
}

function pngFile(name = "receipt.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

interface SupabaseConfig {
  existingDoc?: { id: string } | null;
  attachments?: Array<{ id: string; original_filename: string }>;
  documentInsert?: { id: string } | null;
  documentInsertError?: { code?: string } | null;
  attachmentInsertError?: { code?: string } | null;
  uploadError?: boolean;
}

function makeSupabase(cfg: SupabaseConfig) {
  const calls = { docDelete: 0, attDelete: 0, remove: 0, upload: 0, docInsert: 0, attInsert: 0 };

  function resolveTerminal(table: string, op: string) {
    if (table === "documents" && op === "insert") return { data: cfg.documentInsert ?? null, error: cfg.documentInsertError ?? null };
    if (table === "documents" && op === "select") return { data: cfg.existingDoc ?? null, error: null };
    if (table === "document_attachments" && op === "select") return { data: cfg.attachments ?? [], error: null };
    if (table === "document_attachments" && op === "insert") return { error: cfg.attachmentInsertError ?? null };
    return { data: null, error: null };
  }

  function builder(table: string) {
    let op = "select";
    const b: Record<string, unknown> = {};
    b.insert = vi.fn(() => { op = "insert"; if (table === "documents") calls.docInsert++; else calls.attInsert++; return b; });
    b.delete = vi.fn(() => { op = "delete"; if (table === "documents") calls.docDelete++; else calls.attDelete++; return b; });
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.single = vi.fn(async () => resolveTerminal(table, op));
    b.maybeSingle = vi.fn(async () => resolveTerminal(table, op));
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolveTerminal(table, op)).then(onF, onR);
    return b;
  }

  const storage = {
    from: () => ({
      upload: vi.fn(async () => { calls.upload++; return { error: cfg.uploadError ? { message: "boom" } : null }; }),
      remove: vi.fn(async () => { calls.remove++; return { error: null }; }),
    }),
  };

  const client = { from: vi.fn((table: string) => builder(table)), storage } as unknown as SupabaseClient;
  return { client, calls };
}

const baseInput = { title: "Receipt", description: "", doc_type: "note" as const, entity_type: null, entity_id: null };

beforeEach(() => {
  vi.clearAllMocks();
  getBlockedReason.mockResolvedValue(null);
  assertWithinLimit.mockResolvedValue(undefined);
  reserveOrganizationUsage.mockResolvedValue(undefined);
});

describe("createDocumentWithAttachments", () => {
  it("denies without data.write and touches nothing", async () => {
    const { client, calls } = makeSupabase({});
    const result = await createDocumentWithAttachments(client, ctxWith([]), { input: baseInput, files: [pngFile()] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(calls.docInsert).toBe(0);
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
  });

  it("a quota denial fails before any storage write (no partial records)", async () => {
    reserveOrganizationUsage.mockRejectedValue(new Error("Plan limit reached."));
    const { client, calls } = makeSupabase({});
    const result = await createDocumentWithAttachments(client, ctxWith(["data.write"]), { input: baseInput, files: [pngFile()] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(calls.docInsert).toBe(0);
    expect(calls.upload).toBe(0);
  });

  it("reuses the stored Document on an idempotent retry (same capture id)", async () => {
    const { client, calls } = makeSupabase({
      existingDoc: { id: DOC_ID },
      attachments: [{ id: "att-1", original_filename: "receipt.png" }],
    });
    const result = await createDocumentWithAttachments(client, ctxWith(["data.write"]), {
      input: baseInput,
      files: [pngFile()],
      inboxCaptureId: "cap-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reused).toBe(true);
      expect(result.documentId).toBe(DOC_ID);
    }
    // No new work on a retry.
    expect(calls.docInsert).toBe(0);
    expect(calls.upload).toBe(0);
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
  });

  it("rolls back the Document when a file upload fails", async () => {
    const { client, calls } = makeSupabase({ documentInsert: { id: DOC_ID }, uploadError: true });
    const result = await createDocumentWithAttachments(client, ctxWith(["data.write"]), { input: baseInput, files: [pngFile()] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
    // The half-created Document row is removed; the delete trigger returns the
    // usage reservation, so we must NOT release it explicitly (double refund).
    expect(calls.docDelete).toBe(1);
    expect(releaseOrganizationUsage).not.toHaveBeenCalled();
    // Nothing reached storage successfully, so no objects to remove.
    expect(calls.remove).toBe(0);
  });

  it("succeeds and does not queue extraction for a non-financial doc type", async () => {
    const { client } = makeSupabase({ documentInsert: { id: DOC_ID } });
    const result = await createDocumentWithAttachments(client, ctxWith(["data.write"]), { input: baseInput, files: [pngFile()] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.documentId).toBe(DOC_ID);
      expect(result.extractionQueued).toBe(false);
      expect(result.reused).toBe(false);
    }
    expect(enqueueDocumentExtraction).not.toHaveBeenCalled();
    expect(emitDomainEvent).toHaveBeenCalled();
  });

  it("queues extraction when forced (Inbox capture), never posting money", async () => {
    enqueueDocumentExtraction.mockResolvedValue({ ok: true, extractionId: "ext-1" } as never);
    const { client } = makeSupabase({ documentInsert: { id: DOC_ID } });
    const result = await createDocumentWithAttachments(client, ctxWith(["data.write"]), {
      input: baseInput,
      files: [pngFile()],
      queueExtraction: true,
      source: "inbox",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractionQueued).toBe(true);
    // Extraction is enqueued for later — the upload itself posts no transaction.
    expect(enqueueDocumentExtraction).toHaveBeenCalledTimes(1);
  });
});
