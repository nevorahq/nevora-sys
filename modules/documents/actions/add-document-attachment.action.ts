"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { assertPlanLimit, assertSubscriptionWritable } from "@/modules/billing";
import { addDocumentAttachmentSchema } from "../schemas/document.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { hasDocumentPermission } from "../services/document-permissions";

/**
 * Регистрирует метаданные файла после успешного upload в Supabase Storage.
 * Сам upload выполняется на клиенте через Supabase Storage SDK.
 * Этот action только фиксирует факт наличия файла в БД.
 *
 * Путь в Storage: documents/{org_id}/{document_id}/{file_name}
 */
export async function addDocumentAttachmentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();
  const { user, org } = ctx;
  if (!hasDocumentPermission(ctx, "document.attachment.upload")) {
    return { error: "You do not have permission to upload attachments." };
  }

  const rawData = {
    documentId: formData.get("documentId") as string,
    file_name:  formData.get("file_name") as string,
    file_path:  formData.get("file_path") as string,
    file_size:  formData.get("file_size") ? Number(formData.get("file_size")) : null,
    mime_type:  (formData.get("mime_type") as string) || null,
  };

  const parsed = addDocumentAttachmentSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    // Verify document belongs to org
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", parsed.data.documentId)
      .eq("organization_id", org.id)
      .single();

    if (!doc) return { error: "Document not found" };

    // Storage limits are canonical bytes internally; file_size already uses bytes.
    try {
      await assertSubscriptionWritable(org.id);
      await assertPlanLimit(org.id, "storage.bytes", parsed.data.file_size ?? 0);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Storage limit reached. Upgrade your plan." };
    }

    // Ensure file_path starts with org prefix (защита от path traversal)
    const expectedPrefix = `documents/${org.id}/`;
    if (!parsed.data.file_path.startsWith(expectedPrefix)) {
      return { error: "Invalid file path" };
    }

    const { data: newAttachment, error } = await supabase
      .from("document_attachments")
      .insert({
        document_id:     parsed.data.documentId,
        organization_id: org.id,
        created_by:      user.id,
        file_name:       parsed.data.file_name,
        file_path:       parsed.data.file_path,
        file_size:       parsed.data.file_size,
        mime_type:       parsed.data.mime_type,
      })
      .select("id")
      .single();

    if (error || !newAttachment) {
      console.error("addDocumentAttachment error:", error);
      return { error: "Failed to register attachment" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "document_attachments",
      entityId:       newAttachment.id,
      action:         "create",
      newData:        { document_id: parsed.data.documentId, file_name: parsed.data.file_name },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("addDocumentAttachment unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
