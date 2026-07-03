import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  assertPlanLimit,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/modules/billing";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { validateDocumentFiles } from "./validate-document-file";
import { persistDocumentAttachments } from "./persist-document-attachments";

type SubscriptionRow = {
  id: string;
  name: string;
  note: string | null;
};

export type CreateSubscriptionDocumentResult =
  | {
      ok: true;
      documentId: string;
      attachments: Array<{ id: string; original_filename: string }>;
      relationCreated: boolean;
      warning?: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Creates a regular Documents record for files attached during subscription
 * creation. This path deliberately uses doc_type=other and never queues document
 * extraction, so it cannot create a Money draft or transaction.
 */
export async function createSubscriptionDocumentWithAttachments(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  subscriptionId: string;
  files: File[];
}): Promise<CreateSubscriptionDocumentResult> {
  const { supabase, ctx, subscriptionId, files } = params;
  if (files.length === 0) {
    return { ok: false, status: 400, error: "At least one file is required to create a subscription document." };
  }

  const filesValidation = validateDocumentFiles(files);
  if (!filesValidation.ok) return { ok: false, status: 400, error: filesValidation.message };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, name, note")
    .eq("id", subscriptionId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!subscription) return { ok: false, status: 404, error: "Subscription not found." };
  const subscriptionRow = subscription as SubscriptionRow;

  try {
    await assertPlanLimit(ctx.org.id, "storage.bytes", files.reduce((total, file) => total + file.size, 0));
    await reserveOrganizationUsage(ctx.org.id, "documents.count", 1);
  } catch (error) {
    return {
      ok: false,
      status: 403,
      error: error instanceof Error ? error.message : "Your plan limit has been reached.",
    };
  }

  // Guards the reservation against a thrown exception between reserve and a
  // committed `documents` row. Once the row exists the counter legitimately
  // backs it (and the removal trigger releases on any later delete/rollback),
  // so the catch must NOT release — that would double-decrement (P1-3).
  let documentCreated = false;
  try {
    const title = `${subscriptionRow.name} — ${files.length === 1 ? files[0].name : "attachments"}`.slice(0, 300);
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        organization_id: ctx.org.id,
        workspace_id: ctx.workspace.id,
        title,
        content: subscriptionRow.note?.trim() || `Documents attached to subscription ${subscriptionRow.name}.`,
        doc_type: "other",
        status: "draft",
        entity_type: null,
        entity_id: null,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (documentError || !document) {
      console.error("createSubscriptionDocument: document creation failed", documentError);
      await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
      return { ok: false, status: 500, error: "We could not create the subscription document. Please try again." };
    }
    documentCreated = true;
    const documentId = document.id as string;

  const persisted = await persistDocumentAttachments({ supabase, ctx, documentId, files });
  if (!persisted.ok) {
    await rollbackSubscriptionDocument(supabase, ctx, documentId, persisted.uploadedPaths);
    console.error("createSubscriptionDocument: upload failed, rolled back document", persisted.error);
    return { ok: false, status: 500, error: persisted.error };
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "document.created",
      aggregateType: "document",
      aggregateId: documentId,
      payload: { title, source: "subscription", skip_money_sync: true },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "documents",
      entityId: documentId,
      action: "create",
      newData: { title, source: "subscription", subscription_id: subscriptionId },
      metadata: { source: "dashboard", trigger: "subscription_creation", skip_money_sync: true },
    }),
    ...persisted.attachments.flatMap((attachment) => [
      emitDomainEvent({
        organizationId: ctx.org.id,
        workspaceId: ctx.workspace.id,
        eventName: "document.attachment_uploaded",
        aggregateType: "document",
        aggregateId: documentId,
        payload: { filename: attachment.original_filename, size_bytes: attachment.size_bytes },
      }),
      emitAuditLog({
        organizationId: ctx.org.id,
        entityType: "document_attachments",
        entityId: attachment.id,
        action: "create",
        newData: { document_id: documentId, file_name: attachment.original_filename },
        metadata: { source: "dashboard", trigger: "subscription_creation", skip_money_sync: true },
      }),
    ]),
  ]);

  const relation = await createEntityLink({
    sourceType: "subscription",
    sourceId: subscriptionId,
    targetType: "document",
    targetId: documentId,
    linkType: "documented_by",
    relationDirection: "bidirectional",
    metadata: { source: "auto", matched_by: ["subscription_creation"] },
  });

  const attachments = persisted.attachments.map(({ id, original_filename }) => ({ id, original_filename }));
  if (!relation.ok) {
    console.error("createSubscriptionDocument: relation creation failed", relation.error);
    return {
      ok: true,
      documentId,
      attachments,
      relationCreated: false,
      warning: "The document was uploaded, but it could not be linked to the subscription.",
    };
  }

  return { ok: true, documentId, attachments, relationCreated: true };
  } catch (err) {
    // Only release when no document row was ever committed; otherwise the row
    // (or its rollback delete) owns the counter and releasing here would drift
    // it negative.
    if (!documentCreated) await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
    throw err;
  }
}

async function rollbackSubscriptionDocument(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
  uploadedPaths: string[],
): Promise<void> {
  try {
    if (uploadedPaths.length > 0) await supabase.storage.from("documents").remove(uploadedPaths);
    await supabase.from("document_attachments").delete().eq("document_id", documentId).eq("organization_id", ctx.org.id);
    await supabase.from("documents").delete().eq("id", documentId).eq("organization_id", ctx.org.id);
  } catch (rollbackError) {
    console.error("createSubscriptionDocument: rollback failed", rollbackError);
  }
}
