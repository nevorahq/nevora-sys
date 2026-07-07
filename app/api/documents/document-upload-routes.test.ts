import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAppAccess = vi.fn();
const createClient = vi.fn();
const createTaskDocumentWithAttachments = vi.fn();
const createSubscriptionDocumentWithAttachments = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/security", () => ({
  requireAppAccess,
  isAccessError: (err: unknown) =>
    Boolean((err as { code?: string; httpStatus?: number } | null)?.code),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/modules/documents/services/document-permissions", () => ({
  hasDocumentPermission: () => true,
}));
vi.mock("@/modules/documents/services/create-task-document-with-attachments", () => ({
  createTaskDocumentWithAttachments,
}));
vi.mock("@/modules/documents/services/create-subscription-document-with-attachments", () => ({
  createSubscriptionDocumentWithAttachments,
}));

const { POST: taskPost } = await import("./../tasks/[taskId]/document/route");
const { POST: subscriptionPost } = await import(
  "./../subscriptions/[subscriptionId]/document/route"
);

const VALID_ID = "11111111-1111-4111-8111-111111111111";

function expiredAccessError() {
  return Object.assign(new Error("Your trial has ended. Choose a plan to continue editing."), {
    code: "TRIAL_EXPIRED",
    httpStatus: 402,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("document upload routes deny non-writable orgs", () => {
  it("task document upload returns the typed access status for an expired org", async () => {
    requireAppAccess.mockRejectedValue(expiredAccessError());

    const response = await taskPost(new Request("https://nevora.test", { method: "POST" }), {
      params: Promise.resolve({ taskId: VALID_ID }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toContain("trial has ended");
    expect(createTaskDocumentWithAttachments).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("subscription document upload returns the typed access status for an expired org", async () => {
    requireAppAccess.mockRejectedValue(expiredAccessError());

    const response = await subscriptionPost(
      new Request("https://nevora.test", { method: "POST" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { params: Promise.resolve({ subscriptionId: VALID_ID }) } as any,
    );

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toContain("trial has ended");
    expect(createSubscriptionDocumentWithAttachments).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
