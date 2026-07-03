import { beforeEach, describe, expect, it, vi } from "vitest";

const assertPlanLimit = vi.fn();
const reserveOrganizationUsage = vi.fn();
const releaseOrganizationUsage = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();

vi.mock("@/modules/billing", () => ({ assertPlanLimit, reserveOrganizationUsage, releaseOrganizationUsage }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { createTaskDocumentWithAttachments } = await import("./create-task-document-with-attachments");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "55555555-5555-4555-8555-555555555555";

const CTX = { org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } } as never;

type Behavior = {
  task?: { data: unknown; error: unknown };
  uploadError?: boolean;
  attachmentInsertError?: boolean;
};

let ops: string[];
let storageUploads: number;
let storageRemovals: string[][];

function makeSupabase(behavior: Behavior) {
  const handle = (table: string, op: string) => {
    if (table === "todos") return behavior.task ?? { data: { id: TASK_ID, title: "Call supplier", description: "Ring back", priority: "high", due_date: null, recurrence: "none" }, error: null };
    if (table === "documents" && op === "insert") return { data: { id: DOC_ID }, error: null };
    if (table === "document_attachments" && op === "insert") return { error: behavior.attachmentInsertError ? { message: "insert failed" } : null };
    return { data: null, error: null };
  };

  const from = vi.fn((table: string) => {
    let op = "select";
    const result = () => {
      ops.push(`${table}:${op}`);
      return Promise.resolve(handle(table, op));
    };
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn(() => { op = "insert"; return builder; });
    builder.delete = vi.fn(() => { op = "delete"; return builder; });
    builder.update = vi.fn(() => { op = "update"; return builder; });
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.single = vi.fn(result);
    builder.maybeSingle = vi.fn(result);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
    return builder;
  });

  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(() => { storageUploads += 1; return Promise.resolve({ error: behavior.uploadError ? { message: "upload failed" } : null }); }),
      remove: vi.fn((paths: string[]) => { storageRemovals.push(paths); return Promise.resolve({ error: null }); }),
    })),
  };

  return { from, storage } as never;
}

function pngFile(name = "receipt.png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  storageUploads = 0;
  storageRemovals = [];
  assertPlanLimit.mockResolvedValue(undefined);
  reserveOrganizationUsage.mockResolvedValue(1);
  releaseOrganizationUsage.mockResolvedValue(0);
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("createTaskDocumentWithAttachments", () => {
  it("creates a draft document linked to the task and uploads attachments", async () => {
    const supabase = makeSupabase({});
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [pngFile()] });

    expect(result).toEqual({ ok: true, documentId: DOC_ID, attachments: [{ id: expect.any(String), original_filename: "receipt.png" }] });
    expect(ops).toContain("documents:insert");
    expect(ops).toContain("document_attachments:insert");
    expect(storageUploads).toBe(1);
    // entity link + draft status are part of the insert payload.
    const documentInsert = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.results
      .map((r) => r.value as { insert: ReturnType<typeof vi.fn> })
      .find((b) => b.insert.mock.calls.length > 0 && b.insert.mock.calls[0][0].entity_type === "task");
    expect(documentInsert?.insert.mock.calls[0][0]).toMatchObject({ status: "draft", entity_type: "task", entity_id: TASK_ID });
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "document.created" }));
  });

  it("returns a 400 and creates nothing when there are no files", async () => {
    const supabase = makeSupabase({});
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [] });

    expect(result).toEqual({ ok: false, status: 400, error: expect.stringMatching(/file is required/i) });
    expect(ops).not.toContain("documents:insert");
    expect(assertPlanLimit).not.toHaveBeenCalled();
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("rolls back the document and storage when an upload fails — no empty draft is left", async () => {
    const supabase = makeSupabase({ uploadError: true });
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [pngFile()] });

    expect(result.ok).toBe(false);
    // Document was created then deleted; attachment rows cleaned up too.
    expect(ops).toContain("documents:insert");
    expect(ops).toContain("documents:delete");
    expect(ops).toContain("document_attachments:delete");
    // document.created must not fire for a rolled-back document.
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("rolls back uploaded files when the attachment metadata insert fails", async () => {
    const supabase = makeSupabase({ attachmentInsertError: true });
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [pngFile()] });

    expect(result.ok).toBe(false);
    expect(storageRemovals.flat().length).toBe(1); // the uploaded object is removed
    expect(ops).toContain("documents:delete");
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("checks the documents limit only here, and blocks when it is reached", async () => {
    reserveOrganizationUsage.mockRejectedValue(new Error("Document limit reached"));
    const supabase = makeSupabase({});
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [pngFile()] });

    expect(result).toEqual({ ok: false, status: 403, error: "Document limit reached" });
    expect(ops).not.toContain("documents:insert");
  });

  it("checks attachment storage in bytes", async () => {
    const file = pngFile();
    await createTaskDocumentWithAttachments({ supabase: makeSupabase({}), ctx: CTX, taskId: TASK_ID, files: [file] });

    expect(assertPlanLimit).toHaveBeenCalledWith(ORG_ID, "storage.bytes", file.size);
  });

  it("returns 404 when the task does not exist", async () => {
    const supabase = makeSupabase({ task: { data: null, error: null } });
    const result = await createTaskDocumentWithAttachments({ supabase, ctx: CTX, taskId: TASK_ID, files: [pngFile()] });

    expect(result).toEqual({ ok: false, status: 404, error: "Task not found." });
    expect(ops).not.toContain("documents:insert");
  });
});
