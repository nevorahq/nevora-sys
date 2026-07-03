"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { createDocumentSchema } from "../schemas/document.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { hasDocumentPermission } from "../services/document-permissions";

export async function createDocumentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();
  const { user, org, workspace } = ctx;
  if (!hasDocumentPermission(ctx, "document.create")) {
    return { error: "You do not have permission to create documents." };
  }

  const rawData = {
    title:       formData.get("title") as string,
    content:     (formData.get("content") as string) || "",
    doc_type:    (formData.get("doc_type") as string) || "note",
    status:      (formData.get("status") as string) || "draft",
    entity_type: (formData.get("entity_type") as string) || null,
    entity_id:   (formData.get("entity_id") as string) || null,
  };

  const parsed = createDocumentSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // Live reservation not yet backed by a row; released in the outer catch if we
  // never reach a committed insert (P1-3).
  let reserved = false;
  try {
    await reserveOrganizationUsage(org.id, "documents.count", 1);
    reserved = true;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Plan limit reached. Upgrade your plan." };
  }

  try {
    const supabase = await createClient();

    const { data: newDoc, error } = await supabase
      .from("documents")
      .insert({
        organization_id: org.id,
        workspace_id:    workspace.id,
        created_by:      user.id,
        updated_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newDoc) {
      console.error("createDocument error:", error);
      await releaseOrganizationUsage(org.id, "documents.count", 1);
      return { error: "Failed to create document" };
    }
    reserved = false;

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "document.created",
        aggregateType:  "document",
        aggregateId:    newDoc.id,
        payload:        { title: parsed.data.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "documents",
        entityId:       newDoc.id,
        action:         "create",
        newData:        { title: parsed.data.title, doc_type: parsed.data.doc_type, status: parsed.data.status },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createDocument unexpected error:", err);
    if (reserved) await releaseOrganizationUsage(org.id, "documents.count", 1);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  return {};
}
