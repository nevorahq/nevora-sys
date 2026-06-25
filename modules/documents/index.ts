// Types
export type {
  Document,
  DocumentVersion,
  DocumentAttachment,
  DocumentLink,
  DocumentComment,
  DocumentWithDetails,
  DocumentSummary,
} from "./types/document.types";

// Constants
export {
  DOCUMENT_TYPES, DOCUMENT_STATUSES, DOCUMENT_ENTITY_TYPES, DOCUMENT_LINK_TYPES,
  DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_LINK_TYPE_LABELS,
  DOCUMENT_TITLE_MAX, DOCUMENT_CONTENT_MAX,
  ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_MAX_FILE_SIZE_BYTES, DOCUMENT_MAX_FILES, DOCUMENT_MAX_TOTAL_SIZE_BYTES,
  DOCUMENT_UPLOAD_ACCEPT,
} from "./constants/document.constants";
export type {
  DocumentType, DocumentStatus, DocumentEntityType, DocumentLinkType, DocumentExtension,
} from "./constants/document.constants";

// Schemas
export {
  createDocumentSchema, updateDocumentSchema,
  publishDocumentSchema, addDocumentLinkSchema,
  addDocumentCommentSchema, addDocumentAttachmentSchema,
  createDocumentUploadSchema, documentUploadSchema,
} from "./schemas/document.schemas";
export type {
  CreateDocumentInput, UpdateDocumentInput,
  AddDocumentLinkInput, AddDocumentCommentInput, AddDocumentAttachmentInput,
  CreateDocumentUploadInput, DocumentUploadInput,
} from "./schemas/document.schemas";

// Queries
export { getDocuments, getDocumentSummary } from "./queries/get-documents";
export type { GetDocumentsOptions } from "./queries/get-documents";
export { getDocumentById } from "./queries/get-document-by-id";

// Actions
export { createDocumentAction }    from "./actions/create-document.action";
export { updateDocumentAction }    from "./actions/update-document.action";
export { deleteDocumentAction }    from "./actions/delete-document.action";
export { publishDocumentAction }   from "./actions/publish-document.action";
export { addDocumentLinkAction }   from "./actions/add-document-link.action";
export { addDocumentCommentAction } from "./actions/add-document-comment.action";
export { addDocumentAttachmentAction } from "./actions/add-document-attachment.action";
export { deleteDocumentAttachmentAction } from "./actions/delete-document-attachment.action";
