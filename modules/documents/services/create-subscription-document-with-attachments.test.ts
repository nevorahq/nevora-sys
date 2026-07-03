import { beforeEach, describe, expect, it, vi } from "vitest";

const assertPlanLimit = vi.fn();
const reserveOrganizationUsage = vi.fn();
const releaseOrganizationUsage = vi.fn();
const createEntityLink = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();

vi.mock("@/modules/billing", () => ({ assertPlanLimit, reserveOrganizationUsage, releaseOrganizationUsage }));
vi.mock("@/lib/entity-links", () => ({ createEntityLink }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { createSubscriptionDocumentWithAttachments } = await import("./create-subscription-document-with-attachments");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const SUBSCRIPTION_ID = "44444444-4444-4444-8444-444444444444";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";
const CTX = {
  org: { id: ORG_ID },
  workspace: { id: WORKSPACE_ID },
  user: { id: USER_ID },
} as never;

type Behavior = {
  subscription?: unknown;
  uploadError?: boolean;
};

function makeSupabase(behavior: Behavior = {}) {
  const calls: string[] = [];
  const insertPayloads: Record<string, unknown> = {};
  const from = vi.fn((table: string) => {
    let operation = "select";
    const resolve = () => {
      calls.push(`${table}:${operation}`);
      if (table === "subscriptions") {
        return Promise.resolve({
          data: behavior.subscription === undefined
            ? { id: SUBSCRIPTION_ID, name: "Cloud plan", note: null }
            : behavior.subscription,
          error: null,
        });
      }
      if (table === "documents" && operation === "insert") {
        return Promise.resolve({ data: { id: DOCUMENT_ID }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn((payload: unknown) => {
      operation = "insert";
      insertPayloads[table] = payload;
      return builder;
    });
    builder.delete = vi.fn(() => { operation = "delete"; return builder; });
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn(resolve);
    builder.maybeSingle = vi.fn(resolve);
    (builder as { then: unknown }).then = (resolvePromise: (value: unknown) => unknown, rejectPromise: (error: unknown) => unknown) =>
      resolve().then(resolvePromise, rejectPromise);
    return builder;
  });
  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(() => Promise.resolve({ error: behavior.uploadError ? { message: "failed" } : null })),
      remove: vi.fn(() => Promise.resolve({ error: null })),
    })),
  };
  return { client: { from, storage } as never, calls, insertPayloads, from };
}

function receiptFile() {
  return new File([new Uint8Array([1, 2, 3])], "receipt.webp", { type: "image/webp" });
}

beforeEach(() => {
  vi.clearAllMocks();
  assertPlanLimit.mockResolvedValue(undefined);
  reserveOrganizationUsage.mockResolvedValue(1);
  releaseOrganizationUsage.mockResolvedValue(0);
  createEntityLink.mockResolvedValue({ ok: true, data: { id: "relation-id" } });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("createSubscriptionDocumentWithAttachments", () => {
  it("creates a visible document and relation without creating a Money transaction", async () => {
    const supabase = makeSupabase();

    const result = await createSubscriptionDocumentWithAttachments({
      supabase: supabase.client,
      ctx: CTX,
      subscriptionId: SUBSCRIPTION_ID,
      files: [receiptFile()],
    });

    expect(result).toMatchObject({
      ok: true,
      documentId: DOCUMENT_ID,
      relationCreated: true,
      attachments: [{ original_filename: "receipt.webp" }],
    });
    expect(supabase.calls).toContain("documents:insert");
    expect(supabase.calls).toContain("document_attachments:insert");
    expect(supabase.from).not.toHaveBeenCalledWith("money_transactions");
    expect(supabase.insertPayloads.documents).toMatchObject({
      doc_type: "other",
      status: "draft",
      entity_type: null,
      entity_id: null,
    });
    expect(createEntityLink).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "subscription",
      sourceId: SUBSCRIPTION_ID,
      targetType: "document",
      targetId: DOCUMENT_ID,
      linkType: "documented_by",
    }));
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "document.created",
      payload: expect.objectContaining({ source: "subscription", skip_money_sync: true }),
    }));
    expect(emitDomainEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.created" }),
    );
  });

  it("keeps the document visible and returns a warning when relation creation fails", async () => {
    createEntityLink.mockResolvedValue({ ok: false, error: "relation failed" });
    const supabase = makeSupabase();

    const result = await createSubscriptionDocumentWithAttachments({
      supabase: supabase.client,
      ctx: CTX,
      subscriptionId: SUBSCRIPTION_ID,
      files: [receiptFile()],
    });

    expect(result).toMatchObject({ ok: true, documentId: DOCUMENT_ID, relationCreated: false, warning: expect.any(String) });
    expect(supabase.calls).not.toContain("documents:delete");
  });

  it("does not create a document for a missing subscription", async () => {
    const supabase = makeSupabase({ subscription: null });

    const result = await createSubscriptionDocumentWithAttachments({
      supabase: supabase.client,
      ctx: CTX,
      subscriptionId: SUBSCRIPTION_ID,
      files: [receiptFile()],
    });

    expect(result).toEqual({ ok: false, status: 404, error: "Subscription not found." });
    expect(supabase.calls).not.toContain("documents:insert");
  });
});
