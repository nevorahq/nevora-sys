import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability/report-error";
import { ROUTES } from "@/shared/config/routes";
import { createDocumentUploadSchema } from "@/modules/documents/schemas/document.schemas";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { createDocumentWithAttachments } from "@/modules/documents/services/document-upload-service";

export const runtime = "nodejs";

/**
 * Thin adapter over the shared Documents upload service. Parses the form, does
 * the coarse document-permission gate, delegates all storage/rollback/extraction
 * work to {@link createDocumentWithAttachments}, then revalidates the Documents
 * screen. Behavior is identical to the previous inline implementation.
 */
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

    const supabase = await createClient();
    const result = await createDocumentWithAttachments(supabase, ctx, {
      input: input.data,
      files,
      source: "dashboard",
    });

    if (!result.ok) {
      return NextResponse.json(
        result.diagnosticId ? { error: result.error, diagnosticId: result.diagnosticId } : { error: result.error },
        { status: result.status },
      );
    }

    revalidatePath(ROUTES.documents);
    return NextResponse.json({ documentId: result.documentId, attachments: result.attachments });
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
