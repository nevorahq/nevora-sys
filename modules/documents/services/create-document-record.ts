import type { CreateDocumentUploadInput } from "../schemas/document.schemas";

/** Maps upload-form data to the current documents table contract. */
export function createDocumentRecord(params: {
  organizationId: string;
  workspaceId: string;
  userId: string;
  input: CreateDocumentUploadInput;
}) {
  return {
    organization_id: params.organizationId,
    workspace_id: params.workspaceId,
    title: params.input.title,
    // `content` is the existing, migration-independent notes field.
    content: params.input.description,
    doc_type: params.input.doc_type,
    status: "draft" as const,
    entity_type: params.input.entity_type,
    entity_id: params.input.entity_id,
    created_by: params.userId,
    updated_by: params.userId,
  };
}
