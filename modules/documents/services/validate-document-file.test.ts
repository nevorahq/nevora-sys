import { describe, expect, it } from "vitest";
import { DOCUMENT_MAX_FILE_SIZE_BYTES } from "../constants/document.constants";
import { validateDocumentFile, validateDocumentFiles } from "./validate-document-file";

describe("document upload validation", () => {
  it("rejects unsupported file types", () => {
    const file = new File(["payload"], "malware.exe", { type: "application/octet-stream" });
    expect(validateDocumentFile(file)).toMatchObject({ ok: false, code: "UNSUPPORTED_FILE_TYPE" });
  });

  it("rejects files larger than 10 MB", () => {
    const file = new File(
      [new Uint8Array(DOCUMENT_MAX_FILE_SIZE_BYTES + 1)],
      "oversized.pdf",
      { type: "application/pdf" },
    );
    expect(validateDocumentFile(file)).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("rejects more than five files", () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      new File(["x"], `receipt-${index}.jpg`, { type: "image/jpeg" }),
    );
    expect(validateDocumentFiles(files)).toMatchObject({ ok: false, code: "TOO_MANY_FILES" });
  });
});
