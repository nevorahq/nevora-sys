export const DOCUMENT_TYPES = ["note", "template", "contract", "report", "sop", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["draft", "published", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_ENTITY_TYPES = ["client", "deal", "task", "workspace"] as const;
export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export const DOCUMENT_LINK_TYPES = ["google_docs", "notion", "figma", "github", "loom", "other"] as const;
export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPES)[number];

export const DOCUMENT_TITLE_MAX = 300;
export const DOCUMENT_CONTENT_MAX = 500_000;
export const DOCUMENT_COMMENT_MAX = 5_000;
export const DOCUMENT_LINK_TITLE_MAX = 200;

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf", "docx", "png", "jpg", "jpeg", "webp", "heic", "heif",
] as const;
export type DocumentExtension = (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number];

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_FILES = 5;
export const DOCUMENT_MAX_TOTAL_SIZE_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_UPLOAD_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/heic,image/heif";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  note:     "Note",
  template: "Template",
  contract: "Contract",
  report:   "Report",
  sop:      "SOP",
  other:    "Other",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft:     "Draft",
  published: "Published",
  archived:  "Archived",
};

export const DOCUMENT_LINK_TYPE_LABELS: Record<DocumentLinkType, string> = {
  google_docs: "Google Docs",
  notion:      "Notion",
  figma:       "Figma",
  github:      "GitHub",
  loom:        "Loom",
  other:       "Link",
};
