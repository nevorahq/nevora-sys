import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
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
    const ctx = await requireOrg();
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

    const [documentLimit, storageLimit] = await Promise.all([
      checkPlanLimit(ctx.org.id, "documents"),
      checkPlanLimit(ctx.org.id, "storage_mb", files.reduce((total, file) => total + file.size, 0) / (1024 * 1024)),
    ]);
    if (!documentLimit.allowed || !storageLimit.allowed) {
      return NextResponse.json({ error: documentLimit.reason ?? storageLimit.reason ?? "Your plan limit has been reached." }, { status: 403 });
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
      return NextResponse.json({ error: "We could not create the document. Please try again." }, { status: 500 });
    }

    const uploadedPaths: string[] = [];
    const attachments: Array<{ id: string; original_filename: string }> = [];
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

    await Promise.all([
      emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.created", aggregateType: "document", aggregateId: document.id, payload: { title: input.data.title } }),
      emitAuditLog({ organizationId: ctx.org.id, entityType: "documents", entityId: document.id, action: "create", newData: { title: input.data.title }, metadata: { source: "dashboard" } }),
      ...attachments.flatMap((attachment) => [
        emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.attachment_uploaded", aggregateType: "document", aggregateId: document.id, payload: { filename: attachment.original_filename, size_bytes: files.find((file) => file.name === attachment.original_filename)?.size ?? 0 } }),
        emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachment.id, action: "create", newData: { document_id: document.id, file_name: attachment.original_filename }, metadata: { source: "dashboard" } }),
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
            const bgCtx = await requireOrg();
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
    console.error("documents upload: unexpected failure", error);
    return NextResponse.json({ error: "We could not finish the upload. Please try again." }, { status: 500 });
  }
}
