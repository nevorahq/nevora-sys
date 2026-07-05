import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DocumentWithDetails } from "../types/document.types";

export async function getDocumentById(
  orgId: string,
  documentId: string,
): Promise<DocumentWithDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(`
      id, organization_id, workspace_id, title, content, doc_type, status,
      entity_type, entity_id, created_by, updated_by, created_at, updated_at, deleted_at,
      document_versions (
        id, document_id, organization_id, version_number, title, content, created_by, created_at
      ),
      document_attachments (
        id, document_id, organization_id, file_name, file_path, file_size, mime_type, created_by, created_at
      ),
      document_links (
        id, document_id, organization_id, title, url, link_type, created_by, created_at
      ),
      document_comments (
        id, document_id, organization_id, user_id, content, edited_at, deleted_at, created_at, updated_at
      )
    `)
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    document_versions:    undefined,
    document_attachments: undefined,
    document_links:       undefined,
    document_comments:    undefined,
    versions:    [...(Array.isArray(data.document_versions)    ? data.document_versions    : [])].sort((a, b) => b.version_number - a.version_number),
    attachments: (Array.isArray(data.document_attachments) ? data.document_attachments : []),
    links:       (Array.isArray(data.document_links)       ? data.document_links       : []),
    comments:    (Array.isArray(data.document_comments)    ? data.document_comments    : []).filter((c) => !c.deleted_at),
  } as DocumentWithDetails;
}
