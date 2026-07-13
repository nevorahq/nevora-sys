import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

// ── Mocked collaborators ─────────────────────────────────────────────────────
const canDo = vi.fn((_ctx: unknown, _permission: string) => true);
const hasDocumentPermission = vi.fn((_ctx: unknown, _permission: string) => true);
const createDocumentWithAttachments = vi.fn();
const createSourcedPlannerEntry = vi.fn();

vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/modules/documents/services/document-permissions", () => ({ hasDocumentPermission }));
vi.mock("@/modules/documents/services/document-upload-service", () => ({ createDocumentWithAttachments }));
vi.mock("./create-sourced-planner-entry", () => ({ createSourcedPlannerEntry }));

const { captureInboxDocument } = await import("./capture-inbox-document");

const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } } as unknown as CurrentContext;
const supabase = {} as unknown as SupabaseClient;

function pngFile(name = "receipt.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  canDo.mockReturnValue(true);
  hasDocumentPermission.mockReturnValue(true);
  createDocumentWithAttachments.mockResolvedValue({
    ok: true,
    documentId: "doc-1",
    attachments: [{ id: "att-1", original_filename: "receipt.png" }],
    extractionQueued: true,
    extractionId: "ext-1",
    reused: false,
  });
  createSourcedPlannerEntry.mockResolvedValue({ ok: true, entry: { id: "entry-1" }, reused: false });
});

describe("captureInboxDocument", () => {
  it("a photo creates exactly one Document and one linked planner entry", async () => {
    const result = await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      note: "lunch",
      entryType: "photo",
      title: "Photo capture 2026-07-13",
    });

    expect(result.ok).toBe(true);
    expect(createDocumentWithAttachments).toHaveBeenCalledTimes(1);
    expect(createSourcedPlannerEntry).toHaveBeenCalledTimes(1);

    // Document reused (idempotent), planner entry links the exact document.
    const uploadArgs = createDocumentWithAttachments.mock.calls[0][2];
    expect(uploadArgs).toMatchObject({ inboxCaptureId: "cap-1", source: "inbox", queueExtraction: true });
    const entryArgs = createSourcedPlannerEntry.mock.calls[0][2];
    expect(entryArgs).toMatchObject({ entity: { kind: "document", id: "doc-1" }, entryType: "photo" });
    if (result.ok) expect(result.entryId).toBe("entry-1");
  });

  it("never posts money: the upload input carries no transaction and no money doc_type", async () => {
    await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      entryType: "document",
      title: "t",
    });
    const uploadInput = createDocumentWithAttachments.mock.calls[0][2].input;
    // doc_type is honest 'unknown' — extraction classifies; upload never posts.
    expect(uploadInput.doc_type).toBe("unknown");
    expect(uploadInput.entity_type).toBeNull();
  });

  it("denies before any upload when the user lacks capture permission", async () => {
    canDo.mockReturnValue(false);
    const result = await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      entryType: "photo",
      title: "t",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(createDocumentWithAttachments).not.toHaveBeenCalled();
  });

  it("propagates an upload failure without creating a planner entry (no partial data)", async () => {
    createDocumentWithAttachments.mockResolvedValue({ ok: false, status: 403, error: "Plan limit reached." });
    const result = await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      entryType: "document",
      title: "t",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("keeps the stored Document when planner linking fails, returning a recoverable warning", async () => {
    createSourcedPlannerEntry.mockResolvedValue({ ok: false, error: "boom" });
    const result = await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      entryType: "document",
      title: "t",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.documentId).toBe("doc-1");
      expect(result.entryId).toBeNull();
      expect(result.warning).toBeTruthy();
    }
  });

  it("a retry reuses the same Document and entry (idempotent)", async () => {
    createDocumentWithAttachments.mockResolvedValue({
      ok: true,
      documentId: "doc-1",
      attachments: [{ id: "att-1", original_filename: "receipt.png" }],
      extractionQueued: false,
      extractionId: null,
      reused: true,
    });
    createSourcedPlannerEntry.mockResolvedValue({ ok: true, entry: { id: "entry-1" }, reused: true });

    const result = await captureInboxDocument(supabase, ctx, {
      files: [pngFile()],
      captureId: "cap-1",
      entryType: "photo",
      title: "t",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reused).toBe(true);
  });
});
