import { describe, expect, it } from "vitest";
import { createDocumentRecord } from "./create-document-record";

describe("createDocumentRecord", () => {
  it("maps notes to the existing content column without requiring a description column", () => {
    const record = createDocumentRecord({
      organizationId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      input: { title: "Invoice", description: "June invoice", doc_type: "note", entity_type: null, entity_id: null },
    });

    expect(record.content).toBe("June invoice");
    expect(record).not.toHaveProperty("description");
  });
});
