import { canDo, type CurrentContext } from "@/lib/context/current-context";

export const DOCUMENT_PERMISSIONS = [
  "document.read",
  "document.create",
  "document.update",
  "document.delete",
  "document.attachment.upload",
  "document.attachment.delete",
] as const;

export type DocumentPermission = (typeof DOCUMENT_PERMISSIONS)[number];

/** Adapts the platform's current RBAC engine to document-specific permissions. */
export function hasDocumentPermission(ctx: CurrentContext, permission: DocumentPermission): boolean {
  if (permission === "document.read") return canDo(ctx, "org.read");
  if (permission === "document.delete" || permission === "document.attachment.delete") {
    return canDo(ctx, "data.delete");
  }
  return canDo(ctx, "data.write");
}
