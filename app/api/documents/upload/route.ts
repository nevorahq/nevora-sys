import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAppAccess, isAccessError, redactFilenameForEvent } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import {
  assertPlanLimit,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/modules/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { reportError } from "@/lib/observability/report-error";
import { ROUTES } from "@/shared/config/routes";
import { createDocumentUploadSchema, documentUploadSchema } from "@/modules/documents/schemas/document.schemas";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { generateDocumentStoragePath, generateSafeFilename } from "@/modules/documents/services/generate-document-storage-path";
import { validateDocumentFile, validateDocumentFiles } from "@/modules/documents/services/validate-document-file";
import { createDocumentRecord } from "@/modules/documents/services/create-document-record";
import { isFinancialDocumentType } from "@/modules/documents/constants/document.constants";
import { enqueueDocumentExtraction, runDocumentExtraction } from "@/modules/documents/services/document-extraction-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireAppAccess({ permission: "data.write", capability: "documents", intent: "write" });
    if (!hasDocumentPermission(ctx, "document.create") || !hasDocumentPermission(ctx, "document.attachment.upload")) {
      return NextResponse.json({ error: "You do not have permission to create documents." }, { status: 403 });
    }

    const formData = await request.formData();
    const input = createDocumentUploadSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description") || "",
      doc_type: formData.get("doc_type") || "note",
      entity_type: formData.get("entity_type") || null,
      entity_id: formData.get("entity_id") || null,
    });
    if (!input.success) {
      return NextResponse.json({ error: input.error.issues[0]?.message ?? "Please review the form." }, { status: 400 });
    }

    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const filesValidation = validateDocumentFiles(files);
    if (!filesValidation.ok) return NextResponse.json(filesValidation, { status: 400 });

    try {
      await assertPlanLimit(ctx.org.id, "storage.bytes", files.reduce((total, file) => total + file.size, 0));
      await reserveOrganizationUsage(ctx.org.id, "documents.count", 1);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Your plan limit has been reached." }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert(createDocumentRecord({
        organizationId: ctx.org.id,
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        input: input.data,
      }))
      .select("id")
      .single();

    if (documentError || !document) {
      console.error("documents upload: document creation failed", documentError);
      await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
      return NextResponse.json({ error: "We could not create the document. Please try again." }, { status: 500 });
    }

    const uploadedPaths: string[] = [];
    const attachments: Array<{ id: string; original_filename: string }> = [];
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
      // Never leave a half-uploaded document behind (P2-4): remove any objects
      // already stored, then the attachment rows, then the document itself.
      // Deleting the document fires release_document_usage_on_removal, so the
      // documents.count reservation is returned — do NOT release it explicitly.
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("documents").remove(uploadedPaths).catch(() => {});
      }
      await supabase.from("document_attachments").delete().eq("document_id", document.id).eq("organization_id", ctx.org.id);
      await supabase.from("documents").delete().eq("id", document.id).eq("organization_id", ctx.org.id);

      const { message, diagnosticId } = reportError("documents.upload.partial_failed", uploadFailure, {
        userMessage: uploadFailure instanceof Error ? uploadFailure.message : "The upload could not be completed. Please try again.",
        fields: { organizationId: ctx.org.id, documentId: document.id },
      });
      return NextResponse.json({ error: message, diagnosticId }, { status: 500 });
    }

    await Promise.all([
      emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.created", aggregateType: "document", aggregateId: document.id, payload: { title: input.data.title } }),
      emitAuditLog({ organizationId: ctx.org.id, entityType: "documents", entityId: document.id, action: "create", newData: { title: input.data.title }, metadata: { source: "dashboard" } }),
      ...attachments.flatMap((attachment) => [
        emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.attachment_uploaded", aggregateType: "document", aggregateId: document.id, payload: { filename: redactFilenameForEvent(attachment.original_filename), size_bytes: files.find((file) => file.name === attachment.original_filename)?.size ?? 0 } }),
        emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachment.id, action: "create", newData: { document_id: document.id, file_name: redactFilenameForEvent(attachment.original_filename) }, metadata: { source: "dashboard" } }),
      ]),
    ]);

    // Document-to-Transaction: a financial document with a file is queued for
    // extraction. We claim the job ('pending') synchronously so the detail page
    // shows a processing state, then run the heavy work (PDF/AI/DB) AFTER the
    // response via Next `after()` — the upload request never blocks on it.
    // Failures never break the upload; the document still exists and is retryable.
    if (isFinancialDocumentType(input.data.doc_type) && attachments.length > 0) {
      const documentId = document.id;
      const enqueued = await enqueueDocumentExtraction(supabase, ctx, documentId);
      if (enqueued.ok) {
        const extractionId = enqueued.extractionId;
        after(async () => {
          try {
            // Re-resolve request-scoped client + context inside the callback.
            const bgSupabase = await createClient();
            const bgCtx = await requireAppAccess({ permission: "data.write", intent: "write" });
            await runDocumentExtraction(bgSupabase, bgCtx, documentId, extractionId);
          } catch (extractionError) {
            console.error("documents upload: background extraction failed", extractionError);
          }
        });
      } else if (enqueued.reason !== "already_running") {
        console.error("documents upload: could not enqueue extraction", enqueued.message);
      }
    }

    revalidatePath(ROUTES.documents);
    return NextResponse.json({ documentId: document.id, attachments });
  } catch (error) {
    if (isAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    const { message, diagnosticId } = reportError("documents.upload.failed", error, {
      userMessage: "We could not finish the upload. Please try again.",
    });
    return NextResponse.json({ error: message, diagnosticId }, { status: 500 });
  }
}
