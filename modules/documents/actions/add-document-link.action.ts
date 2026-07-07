"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitAuditLog } from "@/lib/events";
import { addDocumentLinkSchema } from "../schemas/document.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function addDocumentLinkAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Adding a link is a business write: routed through the control plane so a
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
    title:      formData.get("title") as string,
    url:        formData.get("url") as string,
    link_type:  (formData.get("link_type") as string) || "other",
  };

  const parsed = addDocumentLinkSchema.safeParse(rawData);
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

    const { data: newLink, error } = await supabase
      .from("document_links")
      .insert({
        document_id:     parsed.data.documentId,
        organization_id: org.id,
        created_by:      user.id,
        title:           parsed.data.title,
        url:             parsed.data.url,
        link_type:       parsed.data.link_type,
      })
      .select("id")
      .single();

    if (error || !newLink) {
      console.error("addDocumentLink error:", error);
      return { error: "Failed to add link" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "document_links",
      entityId:       newLink.id,
      action:         "create",
      newData:        { document_id: parsed.data.documentId, url: parsed.data.url },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("addDocumentLink unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
