"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { updateDocumentSchema } from "../schemas/document.schemas";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { hasDocumentPermission } from "../services/document-permissions";
import { normalizeDocumentUpdateFormData } from "../services/normalize-document-update-form-data";

export async function updateDocumentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();
  const { user, org } = ctx;
  if (!hasDocumentPermission(ctx, "document.update")) {
    return { error: "You do not have permission to update documents." };
  }

  const documentId = formData.get("documentId") as string;
  const idParsed = uuidSchema.safeParse(documentId);
  if (!idParsed.success) return { error: "Invalid document ID" };

  const rawData = normalizeDocumentUpdateFormData(formData);

  const parsed = updateDocumentSchema.safeParse(rawData);
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

    const { error } = await supabase
      .from("documents")
      .update({ ...parsed.data, updated_by: user.id })
      .eq("id", idParsed.data)
      .eq("organization_id", org.id);

    if (error) {
      console.error("updateDocument error:", error);
      return { error: "Failed to update document" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName: "document.updated",
        aggregateType: "document",
        aggregateId: idParsed.data,
        payload: { title: typeof parsed.data.title === "string" ? parsed.data.title : "" },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "documents",
        entityId:       idParsed.data,
        action:         "update",
        newData:        parsed.data as Record<string, unknown>,
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("updateDocument unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
