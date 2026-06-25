"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";

export async function publishDocumentAction(documentId: string): Promise<{ error?: string }> {
  const { user, org } = await requireOrg();

  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) return { error: "Invalid document ID" };

  try {
    const supabase = await createClient();

    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, status")
      .eq("id", parsed.data)
      .eq("organization_id", org.id)
      .single();

    if (!doc) return { error: "Document not found" };
    if (doc.status === "published") return {};

    // status → 'published' триггер snapshot_document_on_publish
    // автоматически создаст запись в document_versions
    const { error } = await supabase
      .from("documents")
      .update({ status: "published", updated_by: user.id })
      .eq("id", parsed.data)
      .eq("organization_id", org.id);

    if (error) {
      console.error("publishDocument error:", error);
      return { error: "Failed to publish document" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "document.updated",
        aggregateType:  "document",
        aggregateId:    doc.id,
        payload:        { title: doc.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "documents",
        entityId:       doc.id,
        action:         "status_change",
        oldData:        { status: doc.status },
        newData:        { status: "published" },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("publishDocument unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
