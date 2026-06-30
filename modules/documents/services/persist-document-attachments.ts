import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { generateDocumentStoragePath, generateSafeFilename } from "./generate-document-storage-path";
import { validateDocumentFile, validateDocumentFiles } from "./validate-document-file";

const PREVIEWABLE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export interface PersistedDocumentAttachment {
  id: string;
  original_filename: string;
  size_bytes: number;
}

export type PersistDocumentAttachmentsResult =
  | { ok: true; attachments: PersistedDocumentAttachment[]; uploadedPaths: string[] }
  | { ok: false; error: string; uploadedPaths: string[] };

/** Shared storage + metadata writer used by every entity-linked document flow. */
export async function persistDocumentAttachments(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  documentId: string;
  files: File[];
}): Promise<PersistDocumentAttachmentsResult> {
  const { supabase, ctx, documentId, files } = params;
  const filesValidation = validateDocumentFiles(files);
  if (!filesValidation.ok) return { ok: false, error: filesValidation.message, uploadedPaths: [] };

  const uploadedPaths: string[] = [];
  const attachments: PersistedDocumentAttachment[] = [];

  try {
    for (const file of files) {
      const fileValidation = validateDocumentFile(file);
      if (!fileValidation.ok) throw new Error(fileValidation.message);

      const attachmentId = crypto.randomUUID();
      const safeFilename = generateSafeFilename(file.name, attachmentId, fileValidation.extension);
      const storagePath = generateDocumentStoragePath({
        organizationId: ctx.org.id,
        workspaceId: ctx.workspace.id,
        documentId,
        attachmentId,
        safeFilename,
      });

      const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw new Error("The file could not be uploaded.");
      uploadedPaths.push(storagePath);

      const { error: attachmentError } = await supabase.from("document_attachments").insert({
        id: attachmentId,
        document_id: documentId,
        organization_id: ctx.org.id,
        storage_bucket: "documents",
        storage_path: storagePath,
        file_path: storagePath,
        original_filename: file.name,
        safe_filename: safeFilename,
        file_name: file.name,
        extension: fileValidation.extension,
        client_mime_type: file.type || null,
        mime_type: file.type || null,
        size_bytes: file.size,
        file_size: file.size,
        upload_status: "uploaded",
        scan_status: "not_scanned",
        preview_status: PREVIEWABLE_EXTENSIONS.includes(fileValidation.extension) ? "pending" : "not_available",
        created_by: ctx.user.id,
      });
      if (attachmentError) throw new Error("The file was uploaded but its metadata could not be saved.");

      attachments.push({ id: attachmentId, original_filename: file.name, size_bytes: file.size });
    }

    return { ok: true, attachments, uploadedPaths };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "We could not upload the attachments.",
      uploadedPaths,
    };
  }
}
