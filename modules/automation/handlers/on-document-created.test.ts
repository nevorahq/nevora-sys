import { describe, expect, it, vi } from "vitest";

const createEntityLink = vi.fn();
vi.mock("@/lib/entity-links", () => ({ createEntityLink }));

const { onDocumentCreated } = await import("./on-document-created");

describe("onDocumentCreated", () => {
  it("skips every automation for documents created from a subscription", async () => {
    const result = await onDocumentCreated.run({
      organizationId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      eventId: "33333333-3333-4333-8333-333333333333",
      eventName: "document.created",
      aggregateType: "document",
      aggregateId: "44444444-4444-4444-8444-444444444444",
      payload: { source: "subscription", skip_money_sync: true },
    });

    expect(result).toMatchObject({ status: "skipped" });
    expect(createEntityLink).not.toHaveBeenCalled();
  });
});
