"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitAuditLog } from "@/lib/events";
import { addDocumentCommentSchema } from "../schemas/document.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function addDocumentCommentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Commenting is a business write: routed through the control plane so a
  // non-writable org gets a typed denial (RLS enforces the same).
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org } = ctx;

  const rawData = {
    documentId: formData.get("documentId") as string,
    content:    formData.get("content") as string,
  };

  const parsed = addDocumentCommentSchema.safeParse(rawData);
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

    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", parsed.data.documentId)
      .eq("organization_id", org.id)
      .single();

    if (!doc) return { error: "Document not found" };

    const { data: newComment, error } = await supabase
      .from("document_comments")
      .insert({
        document_id:     parsed.data.documentId,
        organization_id: org.id,
        user_id:         user.id,
        content:         parsed.data.content,
      })
      .select("id")
      .single();

    if (error || !newComment) {
      console.error("addDocumentComment error:", error);
      return { error: "Failed to add comment" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "document_comments",
      entityId:       newComment.id,
      action:         "create",
      newData:        { document_id: parsed.data.documentId },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("addDocumentComment unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
