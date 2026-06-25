import { z } from "zod";
import {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_ENTITY_TYPES,
  DOCUMENT_LINK_TYPES,
  DOCUMENT_TITLE_MAX,
  DOCUMENT_CONTENT_MAX,
  DOCUMENT_COMMENT_MAX,
  DOCUMENT_LINK_TITLE_MAX,
} from "../constants/document.constants";

const documentBaseSchema = z.object({
  title:       z.string().min(1, "Title is required").max(DOCUMENT_TITLE_MAX),
  content:     z.string().max(DOCUMENT_CONTENT_MAX).default(""),
  doc_type:    z.enum(DOCUMENT_TYPES).default("note"),
  status:      z.enum(DOCUMENT_STATUSES).default("draft"),
  entity_type: z.enum(DOCUMENT_ENTITY_TYPES).nullable().default(null),
  entity_id:   z.string().uuid().nullable().default(null),
});

export const createDocumentSchema = documentBaseSchema.refine(
  (d) => (d.entity_type === null) === (d.entity_id === null),
  { message: "entity_type and entity_id must both be set or both be null", path: ["entity_id"] },
);

export const updateDocumentSchema = documentBaseSchema.partial();

export const publishDocumentSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
});

export const addDocumentLinkSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
  title:      z.string().min(1, "Title is required").max(DOCUMENT_LINK_TITLE_MAX),
  url:        z.string().url("Invalid URL"),
  link_type:  z.enum(DOCUMENT_LINK_TYPES).default("other"),
});

export const addDocumentCommentSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
  content:    z.string().min(1, "Comment cannot be empty").max(DOCUMENT_COMMENT_MAX),
});

export const addDocumentAttachmentSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
  file_name:  z.string().min(1),
  file_path:  z.string().min(1),
  file_size:  z.number().positive().nullable().default(null),
  mime_type:  z.string().nullable().default(null),
});

export const createDocumentUploadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160, "Title must be 160 characters or fewer"),
  description: z.string().trim().max(5_000, "Notes must be 5,000 characters or fewer").optional().default(""),
  doc_type: z.enum(DOCUMENT_TYPES).default("note"),
  entity_type: z.enum(DOCUMENT_ENTITY_TYPES).nullable().default(null),
  entity_id: z.string().uuid("Invalid linked record").nullable().default(null),
}).refine(
  (data) => (data.entity_type === null) === (data.entity_id === null),
  { message: "Choose both a linked record type and record ID", path: ["entity_id"] },
);

export const documentUploadSchema = z.object({
  document_id: z.string().uuid(),
  original_filename: z.string().min(1).max(255),
  extension: z.string().min(1).max(10),
  client_mime_type: z.string().max(255).nullable(),
  size_bytes: z.number().int().positive(),
});

export type CreateDocumentInput    = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput    = z.infer<typeof updateDocumentSchema>;
export type AddDocumentLinkInput   = z.infer<typeof addDocumentLinkSchema>;
export type AddDocumentCommentInput = z.infer<typeof addDocumentCommentSchema>;
export type AddDocumentAttachmentInput = z.infer<typeof addDocumentAttachmentSchema>;
export type CreateDocumentUploadInput = z.infer<typeof createDocumentUploadSchema>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
