import type {
  DocumentType,
  DocumentStatus,
  DocumentEntityType,
  DocumentLinkType,
} from "../constants/document.constants";

export interface Document {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  title: string;
  content: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  entity_type: DocumentEntityType | null;
  entity_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  organization_id: string;
  version_number: number;
  title: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface DocumentAttachment {
  id: string;
  document_id: string;
  organization_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
  storage_bucket?: string;
  original_filename?: string;
  safe_filename?: string;
  extension?: string;
  client_mime_type?: string | null;
  detected_mime_type?: string | null;
  size_bytes?: number;
  upload_status?: "uploaded" | "failed" | "pending";
  scan_status?: "not_scanned" | "pending" | "clean" | "failed";
  preview_status?: "not_available" | "pending" | "ready" | "failed";
}

export interface DocumentLink {
  id: string;
  document_id: string;
  organization_id: string;
  title: string;
  url: string;
  link_type: DocumentLinkType;
  created_by: string | null;
  created_at: string;
}

export interface DocumentComment {
  id: string;
  document_id: string;
  organization_id: string;
  user_id: string;
  content: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentWithDetails extends Document {
  versions: DocumentVersion[];
  attachments: DocumentAttachment[];
  links: DocumentLink[];
  comments: DocumentComment[];
}

export interface DocumentSummary {
  total: number;
  drafts: number;
  published: number;
  archived: number;
  byType: Record<DocumentType, number>;
}
