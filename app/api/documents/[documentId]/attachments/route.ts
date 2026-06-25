import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { generateDocumentStoragePath, generateSafeFilename } from "@/modules/documents/services/generate-document-storage-path";
import { validateDocumentFile, validateDocumentFiles } from "@/modules/documents/services/validate-document-file";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/documents/[documentId]/attachments">) {
  try {
    const { documentId } = await context.params;
    const parsedId = uuidSchema.safeParse(documentId);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid document." }, { status: 400 });

    const ctx = await requireOrg();
    if (!hasDocumentPermission(ctx, "document.attachment.upload")) {
      return NextResponse.json({ error: "You do not have permission to upload attachments." }, { status: 403 });
    }
    const formData = await request.formData();
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const filesValidation = validateDocumentFiles(files);
    if (!filesValidation.ok) return NextResponse.json(filesValidation, { status: 400 });

    const storageLimit = await checkPlanLimit(ctx.org.id, "storage_mb", files.reduce((total, file) => total + file.size, 0) / (1024 * 1024));
    if (!storageLimit.allowed) return NextResponse.json({ error: storageLimit.reason ?? "Storage limit reached." }, { status: 403 });

    const supabase = await createClient();
    const { data: document } = await supabase.from("documents").select("id, workspace_id").eq("id", parsedId.data).eq("organization_id", ctx.org.id).single();
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const attachmentIds: string[] = [];
    for (const file of files) {
      const validation = validateDocumentFile(file);
      if (!validation.ok) return NextResponse.json(validation, { status: 400 });
      const attachmentId = crypto.randomUUID();
      const safeFilename = generateSafeFilename(file.name, attachmentId, validation.extension);
      const storagePath = generateDocumentStoragePath({ organizationId: ctx.org.id, workspaceId: document.workspace_id, documentId: document.id, attachmentId, safeFilename });
      const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) return NextResponse.json({ error: "The file could not be uploaded." }, { status: 500 });
      const { error: attachmentError } = await supabase.from("document_attachments").insert({
        id: attachmentId, document_id: document.id, organization_id: ctx.org.id,
        storage_bucket: "documents", storage_path: storagePath, file_path: storagePath,
        original_filename: file.name, safe_filename: safeFilename, file_name: file.name,
        extension: validation.extension, client_mime_type: file.type || null, mime_type: file.type || null,
        size_bytes: file.size, file_size: file.size, upload_status: "uploaded", scan_status: "not_scanned",
        preview_status: ["png", "jpg", "jpeg", "webp"].includes(validation.extension) ? "pending" : "not_available",
        created_by: ctx.user.id,
      });
      if (attachmentError) return NextResponse.json({ error: "The file was uploaded but its metadata could not be saved." }, { status: 500 });
      attachmentIds.push(attachmentId);
      await Promise.all([
        emitDomainEvent({ organizationId: ctx.org.id, workspaceId: document.workspace_id ?? undefined, eventName: "document.attachment_uploaded", aggregateType: "document", aggregateId: document.id, payload: { filename: file.name, size_bytes: file.size } }),
        emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachmentId, action: "create", newData: { document_id: document.id, file_name: file.name }, metadata: { source: "dashboard", trigger: "task_creation" } }),
      ]);
    }
    return NextResponse.json({ attachmentIds });
  } catch (error) {
    console.error("document attachments upload failed", error);
    return NextResponse.json({ error: "We could not upload the attachments. Please try again." }, { status: 500 });
  }
}
