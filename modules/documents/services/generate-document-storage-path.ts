import type { DocumentExtension } from "../constants/document.constants";

export function generateSafeFilename(originalFilename: string, attachmentId: string, extension: DocumentExtension): string {
  const base = originalFilename
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${attachmentId}-${base || "file"}.${extension}`;
}

export function generateDocumentStoragePath(params: {
  organizationId: string;
  workspaceId: string | null | undefined;
  documentId: string;
  attachmentId: string;
  safeFilename: string;
}): string {
  const workspace = params.workspaceId ?? "default";
  // The bucket is private; retaining this prefix gives the DB path a stable,
  // portable canonical form and prevents user-controlled path construction.
  return `documents/${params.organizationId}/${workspace}/${params.documentId}/${params.attachmentId}/${params.safeFilename}`;
}
