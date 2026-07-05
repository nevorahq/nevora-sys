import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Document, DocumentSummary } from "../types/document.types";
import type { DocumentStatus, DocumentType } from "../constants/document.constants";
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from "../constants/document.constants";

export interface GetDocumentsOptions {
  status?: DocumentStatus;
  doc_type?: DocumentType;
  entityType?: string;
  entityId?: string;
  search?: string;
  limit?: number;
}

export async function getDocuments(
  orgId: string,
  options: GetDocumentsOptions = {},
): Promise<Document[]> {
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select(
      "id, organization_id, workspace_id, title, content, doc_type, status, entity_type, entity_id, created_by, updated_by, created_at, updated_at, deleted_at",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.status)     query = query.eq("status", options.status);
  if (options.doc_type)   query = query.eq("doc_type", options.doc_type);
  if (options.entityType) query = query.eq("entity_type", options.entityType);
  if (options.entityId)   query = query.eq("entity_id", options.entityId);
  if (options.search)     query = query.ilike("title", `%${options.search}%`);
  if (options.limit)      query = query.limit(options.limit);

  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getDocuments error:", error);
    return [];
  }

  return (data ?? []) as Document[];
}

export async function getDocumentSummary(orgId: string): Promise<DocumentSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("status, doc_type")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (error) {
    console.error("getDocumentSummary error:", error);
    const emptyByType = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, 0])) as Record<DocumentType, number>;
    return { total: 0, drafts: 0, published: 0, archived: 0, byType: emptyByType };
  }

  const docs = data ?? [];
  const byStatus = Object.fromEntries(DOCUMENT_STATUSES.map((s) => [s, 0])) as Record<DocumentStatus, number>;
  const byType   = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, 0])) as Record<DocumentType, number>;

  for (const doc of docs) {
    byStatus[doc.status as DocumentStatus] = (byStatus[doc.status as DocumentStatus] ?? 0) + 1;
    byType[doc.doc_type as DocumentType]   = (byType[doc.doc_type as DocumentType] ?? 0) + 1;
  }

  return {
    total:     docs.length,
    drafts:    byStatus.draft,
    published: byStatus.published,
    archived:  byStatus.archived,
    byType,
  };
}
