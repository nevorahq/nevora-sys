import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { requireAppAccess, redactFilenameForEvent } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import {
  featureGateService,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
  usageService,
} from "@/modules/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { reportError } from "@/lib/observability/report-error";
import { documentUploadSchema, type CreateDocumentUploadInput } from "../schemas/document.schemas";
import { generateDocumentStoragePath, generateSafeFilename } from "./generate-document-storage-path";
import { validateDocumentFile, validateDocumentFiles } from "./validate-document-file";
import { createDocumentRecord } from "./create-document-record";
import { isFinancialDocumentType } from "../constants/document.constants";
import { enqueueDocumentExtraction, runDocumentExtraction } from "./document-extraction-service";

/**
 * Shared Documents upload service.
 *
 * The single owner of: file validation, billing/quota reservation, Document +
 * attachment persistence, storage upload, partial-failure rollback, audit and
 * domain events, and extraction enqueue. Both the Documents dashboard route
 * (`/api/documents/upload`) and the Inbox binary capture route call this — nothing
 * copies the storage/rollback/extraction loop into Planner.
 *
 * The caller resolves security context (`requireAppAccess`) and supplies the
 * request-scoped Supabase client; this service does the fine-grained document
 * permission checks and all the mutation work, and returns a typed result.
 */

export interface DocumentUploadAttachment {
  id: string;
  original_filename: string;
}

export type DocumentUploadServiceResult =
  | { ok: false; status: number; error: string; diagnosticId?: string }
  | {
      ok: true;
      documentId: string;
      attachments: DocumentUploadAttachment[];
      extractionQueued: boolean;
      extractionId: string | null;
      /** True when an existing capture was reused (idempotent retry), no new writes. */
      reused: boolean;
    };

export interface DocumentUploadServiceParams {
  input: CreateDocumentUploadInput;
  files: File[];
  /**
   * Client-generated idempotency token from an Inbox capture. When present, a
   * retry with the same token reuses the already-stored Document instead of
   * creating a second one (backed by the migration-105 unique index). Null/omit
   * for the Documents dashboard form, which is not retried this way.
   */
  inboxCaptureId?: string | null;
  /** Provenance stamped on audit/domain events. */
  source?: "dashboard" | "inbox";
  /**
   * Whether to queue document extraction after a successful upload.
   * - Documents form: financial doc types only (preserves existing behavior).
   * - Inbox capture: every attachment, so readable files are read and unreadable
   *   ones fail fast into an honest manual-review state.
   * When omitted, defaults to `isFinancialDocumentType(input.doc_type)`.
   */
  queueExtraction?: boolean;
}

function hasWritePermission(ctx: CurrentContext): boolean {
  // Documents permissions collapse to the platform's data.write / data.delete
  // (see hasDocumentPermission). Both document.create and attachment.upload map
  // to data.write, so a single check covers the upload path.
  return ctx.permissions.has("data.write");
}

/**
 * If an Inbox capture with this token already stored a Document, return it so a
 * network retry is a no-op. Scoped to (org, creator, token) exactly like the
 * unique index, so it never leaks another user's capture.
 */
async function resolveExistingCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  inboxCaptureId: string,
): Promise<{ documentId: string; attachments: DocumentUploadAttachment[] } | null> {
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("created_by", ctx.user.id)
    .eq("inbox_capture_id", inboxCaptureId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return null;

  const documentId = existing.id as string;
  const { data: rows } = await supabase
    .from("document_attachments")
    .select("id, original_filename")
    .eq("document_id", documentId)
    .eq("organization_id", ctx.org.id);

  return {
    documentId,
    attachments: (rows ?? []).map((r) => ({
      id: r.id as string,
      original_filename: (r.original_filename as string) ?? "file",
    })),
  };
}

export async function createDocumentWithAttachments(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  params: DocumentUploadServiceParams,
): Promise<DocumentUploadServiceResult> {
  const { input, files } = params;
  const source = params.source ?? "dashboard";
  const inboxCaptureId = params.inboxCaptureId ?? null;
  // The audit `source` enum has no 'inbox'; an Inbox capture arrives over an API
  // route, so 'api' is accurate. `origin` keeps the finer provenance.
  const auditMeta = { source: source === "inbox" ? ("api" as const) : ("dashboard" as const), origin: source };

  if (!hasWritePermission(ctx)) {
    return { ok: false, status: 403, error: "You do not have permission to create documents." };
  }

  const filesValidation = validateDocumentFiles(files);
  if (!filesValidation.ok) return { ok: false, status: 400, error: filesValidation.message };
  if (files.length === 0) return { ok: false, status: 400, error: "Attach at least one file." };

  // Idempotency: a retried Inbox capture reuses the stored Document.
  if (inboxCaptureId) {
    const existing = await resolveExistingCapture(supabase, ctx, inboxCaptureId);
    if (existing) {
      return {
        ok: true,
        documentId: existing.documentId,
        attachments: existing.attachments,
        extractionQueued: false,
        extractionId: null,
        reused: true,
      };
    }
  }

  // Billing: block + reserve BEFORE any storage write, so a quota denial leaves
  // no partial records behind.
  try {
    const blocked = await featureGateService.getBlockedReason(ctx.workspace.id, "storage.files.upload");
    if (blocked) throw new Error(blocked.message);
    await usageService.assertWithinLimit(
      ctx.workspace.id,
      "storage_used_bytes",
      files.reduce((total, file) => total + file.size, 0),
    );
    await reserveOrganizationUsage(ctx.org.id, "documents.count", 1);
  } catch (error) {
    return {
      ok: false,
      status: 403,
      error: error instanceof Error ? error.message : "Your plan limit has been reached.",
    };
  }

  const record = createDocumentRecord({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    input,
  });
  // Only reference the migration-105 column on the Inbox path (which requires the
  // migration anyway). The Documents dashboard form never sends a token, so it
  // stays compatible even in the window before 105 is applied.
  const insertRow = inboxCaptureId ? { ...record, inbox_capture_id: inboxCaptureId } : record;
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert(insertRow)
    .select("id")
    .single();

  if (documentError || !document) {
    // A unique-violation on inbox_capture_id means a concurrent retry won the
    // race — resolve and return that Document instead of erroring.
    if (documentError?.code === "23505" && inboxCaptureId) {
      await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
      const existing = await resolveExistingCapture(supabase, ctx, inboxCaptureId);
      if (existing) {
        return {
          ok: true,
          documentId: existing.documentId,
          attachments: existing.attachments,
          extractionQueued: false,
          extractionId: null,
          reused: true,
        };
      }
    }
    console.error("documents upload: document creation failed", documentError);
    await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
    return { ok: false, status: 500, error: "We could not create the document. Please try again." };
  }

  const uploadedPaths: string[] = [];
  const attachments: DocumentUploadAttachment[] = [];
  try {
    for (const file of files) {
      const fileValidation = validateDocumentFile(file);
      if (!fileValidation.ok) throw new Error(fileValidation.message);
      const attachmentId = crypto.randomUUID();
      const safeFilename = generateSafeFilename(file.name, attachmentId, fileValidation.extension);
      const storagePath = generateDocumentStoragePath({
        organizationId: ctx.org.id,
        workspaceId: ctx.workspace.id,
        documentId: document.id,
        attachmentId,
        safeFilename,
      });
      const metadata = documentUploadSchema.parse({
        document_id: document.id,
        original_filename: file.name,
        extension: fileValidation.extension,
        client_mime_type: file.type || null,
        size_bytes: file.size,
      });

      const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw new Error("The file could not be uploaded.");
      uploadedPaths.push(storagePath);

      const { error: attachmentError } = await supabase.from("document_attachments").insert({
        id: attachmentId,
        document_id: metadata.document_id,
        organization_id: ctx.org.id,
        storage_bucket: "documents",
        storage_path: storagePath,
        file_path: storagePath,
        original_filename: metadata.original_filename,
        safe_filename: safeFilename,
        file_name: metadata.original_filename,
        extension: metadata.extension,
        client_mime_type: metadata.client_mime_type,
        mime_type: metadata.client_mime_type,
        size_bytes: metadata.size_bytes,
        file_size: metadata.size_bytes,
        upload_status: "uploaded",
        scan_status: "not_scanned",
        preview_status: ["png", "jpg", "jpeg", "webp"].includes(metadata.extension) ? "pending" : "not_available",
        created_by: ctx.user.id,
      });
      if (attachmentError) throw new Error("The file was uploaded but its metadata could not be saved.");
      attachments.push({ id: attachmentId, original_filename: metadata.original_filename });
    }
  } catch (uploadFailure) {
    // Never leave a half-uploaded document behind: remove any objects already
    // stored, then the attachment rows, then the document itself. Deleting the
    // document fires release_document_usage_on_removal, so the documents.count
    // reservation is returned — do NOT release it explicitly.
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("documents").remove(uploadedPaths).catch(() => {});
    }
    await supabase.from("document_attachments").delete().eq("document_id", document.id).eq("organization_id", ctx.org.id);
    await supabase.from("documents").delete().eq("id", document.id).eq("organization_id", ctx.org.id);

    const { message, diagnosticId } = reportError("documents.upload.partial_failed", uploadFailure, {
      userMessage: uploadFailure instanceof Error ? uploadFailure.message : "The upload could not be completed. Please try again.",
      fields: { organizationId: ctx.org.id, documentId: document.id },
    });
    return { ok: false, status: 500, error: message, diagnosticId };
  }

  await Promise.all([
    emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.created", aggregateType: "document", aggregateId: document.id, payload: { title: input.title } }),
    emitAuditLog({ organizationId: ctx.org.id, entityType: "documents", entityId: document.id, action: "create", newData: { title: input.title }, metadata: auditMeta }),
    ...attachments.flatMap((attachment) => [
      emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.attachment_uploaded", aggregateType: "document", aggregateId: document.id, payload: { filename: redactFilenameForEvent(attachment.original_filename), size_bytes: files.find((file) => file.name === attachment.original_filename)?.size ?? 0 } }),
      emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachment.id, action: "create", newData: { document_id: document.id, file_name: redactFilenameForEvent(attachment.original_filename) }, metadata: auditMeta }),
    ]),
  ]);

  // Extraction: claim the job ('pending') synchronously so the UI shows a
  // processing state, then run the heavy work (download/AI/DB) AFTER the response
  // via Next `after()`. Failures never break the upload; the document still
  // exists and is retryable. Unreadable types fail fast into an honest review.
  const queueExtraction = params.queueExtraction ?? isFinancialDocumentType(input.doc_type);
  let extractionQueued = false;
  let extractionId: string | null = null;
  if (queueExtraction && attachments.length > 0) {
    const documentId = document.id;
    const enqueued = await enqueueDocumentExtraction(supabase, ctx, documentId);
    if (enqueued.ok) {
      extractionQueued = true;
      extractionId = enqueued.extractionId;
      after(async () => {
        try {
          const bgSupabase = await createClient();
          const bgCtx = await requireAppAccess({ permission: "data.write", intent: "write" });
          await runDocumentExtraction(bgSupabase, bgCtx, documentId, enqueued.extractionId);
        } catch (extractionError) {
          console.error("documents upload: background extraction failed", extractionError);
        }
      });
    } else if (enqueued.reason !== "already_running") {
      console.error("documents upload: could not enqueue extraction", enqueued.message);
    }
  }

  return { ok: true, documentId: document.id, attachments, extractionQueued, extractionId, reused: false };
}
