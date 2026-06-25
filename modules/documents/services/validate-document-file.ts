import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILES,
  DOCUMENT_MAX_TOTAL_SIZE_BYTES,
  type DocumentExtension,
} from "../constants/document.constants";

export type DocumentFileValidationErrorCode =
  | "MISSING_FILENAME"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "TOTAL_SIZE_EXCEEDED";

export type DocumentFileValidationResult =
  | { ok: true; extension: DocumentExtension }
  | { ok: false; code: DocumentFileValidationErrorCode; message: string };

export function getDocumentExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";
}

/**
 * Validates browser-provided file metadata. The route handler is deliberately
 * the only upload entry point so magic-number scanning can be added here later.
 */
export function validateDocumentFile(file: File): DocumentFileValidationResult {
  if (!file.name?.trim()) return { ok: false, code: "MISSING_FILENAME", message: "A file name is required." };

  const extension = getDocumentExtension(file.name);
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension as DocumentExtension)) {
    return { ok: false, code: "UNSUPPORTED_FILE_TYPE", message: "This file type is not supported." };
  }

  // iOS Safari can omit the MIME type for HEIC/HEIF. An empty type is allowed
  // only after the extension check above; a supplied, unrecognised MIME is not.
  if (file.type && !ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_MIME_TYPES[number])) {
    return { ok: false, code: "UNSUPPORTED_FILE_TYPE", message: "This file type is not supported." };
  }
  if (file.size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE", message: "Each file must be 10 MB or smaller." };
  }
  return { ok: true, extension: extension as DocumentExtension };
}

export function validateDocumentFiles(files: File[]): { ok: true } | Exclude<DocumentFileValidationResult, { ok: true }> {
  if (files.length > DOCUMENT_MAX_FILES) return { ok: false, code: "TOO_MANY_FILES", message: "You can add up to 5 files." };
  if (files.reduce((total, file) => total + file.size, 0) > DOCUMENT_MAX_TOTAL_SIZE_BYTES) {
    return { ok: false, code: "TOTAL_SIZE_EXCEEDED", message: "The combined file size must be 25 MB or smaller." };
  }
  for (const file of files) {
    const result = validateDocumentFile(file);
    if (!result.ok) return result;
  }
  return { ok: true };
}
