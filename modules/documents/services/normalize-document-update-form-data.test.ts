import { describe, expect, it } from "vitest";
import { normalizeDocumentUpdateFormData } from "./normalize-document-update-form-data";

describe("normalizeDocumentUpdateFormData", () => {
  it("keeps an empty document body as a string", () => {
    const formData = new FormData();
    formData.set("documentId", "ignored");
    formData.set("title", "A document");
    formData.set("content", "");

    expect(normalizeDocumentUpdateFormData(formData)).toEqual({
      title: "A document",
      content: "",
    });
  });

  it("maps empty optional entity fields to null", () => {
    const formData = new FormData();
    formData.set("entity_type", "");
    formData.set("entity_id", "");

    expect(normalizeDocumentUpdateFormData(formData)).toEqual({
      entity_type: null,
      entity_id: null,
    });
  });
});
