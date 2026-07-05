"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { logger } from "@/lib/observability/logger";
import { describePgError } from "@/lib/observability/pg-error";
import { ROUTES } from "@/shared/config/routes";
import { hasDocumentPermission } from "../services/document-permissions";

type SupabaseActionError = { code?: string; message?: string; details?: string; hint?: string } | null;

function isAlreadyDeletedError(error: SupabaseActionError): boolean {
  return error?.code === "P0002" || error?.message === "document_not_found";
}

function isMissingSoftDeleteRpcError(error: SupabaseActionError): boolean {
  const text = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  return error?.code === "PGRST202" || /soft_delete_document/i.test(text);
}

function isForbiddenError(error: SupabaseActionError): boolean {
  return error?.code === "42501" || /forbidden|subscription_not_writable|trial_expired/i.test(error?.message ?? "");
}

export async function deleteDocumentAction(documentId: string): Promise<{ error?: string }> {
  const ctx = await requireOrg();
  const { org, user } = ctx;
  if (!hasDocumentPermission(ctx, "document.delete")) {
    return { error: "You do not have permission to delete documents." };
  }

  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) return { error: "Invalid document ID" };

  try {
    const supabase = await createClient();

    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, workspace_id")
      .eq("id", parsed.data)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { error: "Document not found" };

    const { error } = await supabase.rpc("soft_delete_document", {
      p_document_id: parsed.data,
      p_organization_id: org.id,
    });

    if (error) {
      // Idempotency for rapid repeat submits: the pre-lookup proved the document
      // existed, so P0002 here means another delete call won the race.
      if (isAlreadyDeletedError(error)) {
        revalidatePath(ROUTES.documents);
        revalidatePath(`${ROUTES.documents}/${parsed.data}`);
        return {};
      }
      if (isMissingSoftDeleteRpcError(error)) {
        const { error: fallbackError } = await supabase
          .from("documents")
          .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
          .eq("id", parsed.data)
          .eq("organization_id", org.id)
          .is("deleted_at", null);

        if (!fallbackError) {
          revalidatePath(ROUTES.documents);
          revalidatePath(`${ROUTES.documents}/${parsed.data}`);
          return {};
        }
        logger.error("document.delete.fallback_failed", {
          documentId: parsed.data,
          ...describePgError(fallbackError),
        });
        if (isForbiddenError(fallbackError)) {
          return { error: "Your organization is read-only right now. Update billing or trial status to delete documents." };
        }
      }
      if (isForbiddenError(error)) {
        return { error: "Your organization is read-only right now. Update billing or trial status to delete documents." };
      }
      logger.error("document.delete.failed", {
        documentId: parsed.data,
        ...describePgError(error),
      });
      return { error: "Failed to delete document" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    (doc.workspace_id as string | null) ?? undefined,
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
    logger.error("document.delete.unexpected", {
      documentId: parsed.data,
      ...describePgError(err),
    });
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.documents);
  revalidatePath(`${ROUTES.documents}/${parsed.data}`);
  return {};
}
