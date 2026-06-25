"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { uuidSchema } from "@/lib/validators/common";
import { hasDocumentPermission } from "../services/document-permissions";

export async function deleteDocumentAttachmentAction(attachmentId: string): Promise<{ error?: string }> {
  const ctx = await requireOrg();
  if (!hasDocumentPermission(ctx, "document.attachment.delete")) return { error: "You do not have permission to remove attachments." };
  const parsed = uuidSchema.safeParse(attachmentId);
  if (!parsed.success) return { error: "Invalid attachment ID." };

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("id, storage_bucket, storage_path, file_path")
    .eq("id", parsed.data)
    .eq("organization_id", ctx.org.id)
    .single();
  if (!attachment) return { error: "Attachment not found." };

  const path = (attachment.storage_path as string | null) ?? attachment.file_path;
  const bucket = (attachment.storage_bucket as string | null) ?? "documents";
  const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
  if (storageError) return { error: "The attachment could not be removed." };
  const { error: databaseError } = await supabase.from("document_attachments").delete().eq("id", attachment.id).eq("organization_id", ctx.org.id);
  if (databaseError) return { error: "The attachment could not be removed." };

  await emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachment.id, action: "delete", metadata: { source: "dashboard" } });
  revalidatePath(ROUTES.documents);
  return {};
}
