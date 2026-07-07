import { beforeEach, describe, expect, it, vi } from "vitest";

const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const reserveOrganizationUsage = vi.fn();
const releaseOrganizationUsage = vi.fn();
const assertPlanLimit = vi.fn();
const validateDocumentFiles = vi.fn();
const persistDocumentAttachments = vi.fn();

vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
// The service imports the REAL, pure redactor (@/lib/security/redact-filename),
// so we leave it unmocked and prove the sanitized value actually reaches events.
vi.mock("@/modules/billing", () => ({
  assertPlanLimit,
  reserveOrganizationUsage,
  releaseOrganizationUsage,
}));
vi.mock("./validate-document-file", () => ({ validateDocumentFiles }));
vi.mock("./persist-document-attachments", () => ({ persistDocumentAttachments }));

const { createTaskDocumentWithAttachments } = await import(
  "./create-task-document-with-attachments"
);

const RAW = "john@example.com.pdf";

function supabaseReturning(taskFound: boolean) {
  const todos = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () =>
              taskFound ? { data: { id: "task-1", title: "T", description: null, priority: "medium", due_date: null, recurrence: null } } : { data: null },
          }),
        }),
      }),
    }),
  };
  const documents = {
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "doc-1" }, error: null }) }) }),
  };
  return { from: (table: string) => (table === "todos" ? todos : documents) };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateDocumentFiles.mockReturnValue({ ok: true });
  assertPlanLimit.mockResolvedValue(undefined);
  reserveOrganizationUsage.mockResolvedValue(undefined);
  persistDocumentAttachments.mockResolvedValue({
    ok: true,
    attachments: [{ id: "att-1", original_filename: RAW, size_bytes: 10 }],
    uploadedPaths: [],
  });
});

describe("attachment events never carry a raw PII filename", () => {
  it("emits the redacted filename for a task document upload", async () => {
    const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } };
    const files = [{ name: RAW, size: 10 }] as unknown as File[];

    const result = await createTaskDocumentWithAttachments({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseReturning(true) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx: ctx as any,
      taskId: "task-1",
      files,
    });

    expect(result.ok).toBe(true);

    const allPayloads = JSON.stringify([emitDomainEvent.mock.calls, emitAuditLog.mock.calls]);
    // The raw email-bearing filename must never appear in any event/audit payload.
    expect(allPayloads).not.toContain("john@example.com");

    const attachmentEvent = emitDomainEvent.mock.calls.find(
      ([arg]) => arg?.eventName === "document.attachment_uploaded",
    );
    expect(attachmentEvent?.[0].payload.filename).toBe("redacted-email.pdf");

    const attachmentAudit = emitAuditLog.mock.calls.find(
      ([arg]) => arg?.entityType === "document_attachments",
    );
    expect(attachmentAudit?.[0].newData.file_name).toBe("redacted-email.pdf");
  });
});
