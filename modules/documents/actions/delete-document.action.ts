"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { hasDocumentPermission } from "../services/document-permissions";

export async function deleteDocumentAction(documentId: string): Promise<{ error?: string }> {
  const ctx = await requireOrg();
  const { org } = ctx;
  if (!hasDocumentPermission(ctx, "document.delete")) {
    return { error: "You do not have permission to delete documents." };
  }

  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) return { error: "Invalid document ID" };

  try {
    const supabase = await createClient();

    const { data: doc } = await supabase
      .from("documents")
      .select("id, title")
      .eq("id", parsed.data)
      .eq("organization_id", org.id)
      .single();

    if (!doc) return { error: "Document not found" };

    const { error } = await supabase.rpc("soft_delete_document", {
      p_document_id: parsed.data,
      p_organization_id: org.id,
    });

    if (error) {
      console.error("deleteDocument error:", error);
      return { error: "Failed to delete document" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "document.deleted",
        aggregateType:  "document",
        aggregateId:    doc.id,
        payload:        { title: doc.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "documents",
        entityId:       doc.id,
        action:         "delete",
        oldData:        { title: doc.title },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("deleteDocument unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
