import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  assertPlanLimit,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/modules/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { redactFilenameForEvent } from "@/lib/security/redact-filename";
import { validateDocumentFiles } from "./validate-document-file";
import { persistDocumentAttachments } from "./persist-document-attachments";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  recurrence: string | null;
};

export type CreateTaskDocumentResult =
  | { ok: true; documentId: string; attachments: Array<{ id: string; original_filename: string }> }
  | { ok: false; status: number; error: string };

/**
 * Single server-side process that creates the *task draft document* and uploads
 * its attachments. A task document is only meaningful when the user actually
 * attached at least one file, so this path is the only place a task-linked
 * `documents` row is created — `createTodoAction` never creates one on its own.
 *
 * Guarantees:
 * - The `documents` limit is consumed only here, i.e. only when a document is
 *   really created (a file-less task never touches it).
 * - `document.created` / audit logs are emitted only after the document and all
 *   attachments are persisted.
 * - If any upload fails the document and any partial attachments are rolled back
 *   so the Drafts list never shows an empty or half-uploaded document.
 */
export async function createTaskDocumentWithAttachments(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  taskId: string;
  files: File[];
}): Promise<CreateTaskDocumentResult> {
  const { supabase, ctx, taskId, files } = params;

  // A document is only created when there is at least one valid file.
  if (files.length === 0) {
    return { ok: false, status: 400, error: "At least one file is required to create a task document." };
  }
  const filesValidation = validateDocumentFiles(files);
  if (!filesValidation.ok) return { ok: false, status: 400, error: filesValidation.message };

  const { data: task } = await supabase
    .from("todos")
    .select("id, title, description, priority, due_date, recurrence")
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { ok: false, status: 404, error: "Task not found." };
  const taskRow = task as TaskRow;

  try {
    await assertPlanLimit(ctx.org.id, "storage.bytes", files.reduce((total, file) => total + file.size, 0));
    await reserveOrganizationUsage(ctx.org.id, "documents.count", 1);
  } catch (error) {
    return { ok: false, status: 403, error: error instanceof Error ? error.message : "Your plan limit has been reached." };
  }

  // Guards the reservation against a thrown exception between reserve and a
  // committed `documents` row. Once the row exists the counter legitimately
  // backs it (and the removal trigger releases on any later delete/rollback),
  // so the catch must NOT release — that would double-decrement (P1-3).
  let documentCreated = false;
  try {
    const content = [
      (taskRow.description ?? "").trim(),
      `Priority: ${taskRow.priority ?? "medium"}`,
      taskRow.due_date ? `Due date: ${taskRow.due_date}` : null,
      taskRow.recurrence === "monthly" ? "Recurring: monthly" : null,
    ].filter(Boolean).join("\n\n");

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        organization_id: ctx.org.id,
        workspace_id: ctx.workspace.id,
        title: taskRow.title,
        content,
        doc_type: "note",
        status: "draft",
        entity_type: "task",
        entity_id: taskRow.id,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (documentError || !document) {
      console.error("createTaskDocument: document creation failed", documentError);
      await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
      return { ok: false, status: 500, error: "We could not create the task document. Please try again." };
    }
    documentCreated = true;
    const documentId = document.id as string;

    const persisted = await persistDocumentAttachments({ supabase, ctx, documentId, files });
    if (!persisted.ok) {
      // Never leave an empty or partially-filled draft behind: undo storage,
      // attachment rows, and the document itself before surfacing the error.
      // Deleting the document fires the removal trigger, which releases the
      // reservation — so we do NOT release explicitly here.
      await rollbackTaskDocument(supabase, ctx, documentId, persisted.uploadedPaths);
      console.error("createTaskDocument: upload failed, rolled back document", persisted.error);
      return { ok: false, status: 500, error: persisted.error };
    }
    const attachments = persisted.attachments;

    await Promise.all([
    emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.created", aggregateType: "document", aggregateId: documentId, payload: { title: taskRow.title } }),
    emitAuditLog({ organizationId: ctx.org.id, entityType: "documents", entityId: documentId, action: "create", newData: { title: taskRow.title, entity_type: "task", entity_id: taskRow.id }, metadata: { source: "dashboard", trigger: "task_creation" } }),
    ...attachments.flatMap((attachment) => {
      const file = files.find((candidate) => candidate.name === attachment.original_filename);
      return [
        emitDomainEvent({ organizationId: ctx.org.id, workspaceId: ctx.workspace.id, eventName: "document.attachment_uploaded", aggregateType: "document", aggregateId: documentId, payload: { filename: redactFilenameForEvent(attachment.original_filename), size_bytes: file?.size ?? 0 } }),
        emitAuditLog({ organizationId: ctx.org.id, entityType: "document_attachments", entityId: attachment.id, action: "create", newData: { document_id: documentId, file_name: redactFilenameForEvent(attachment.original_filename) }, metadata: { source: "dashboard", trigger: "task_creation" } }),
      ];
    }),
  ]);

    return {
      ok: true,
      documentId,
      attachments: attachments.map(({ id, original_filename }) => ({ id, original_filename })),
    };
  } catch (err) {
    // Only release when no document row was ever committed; otherwise the row
    // (or its rollback delete) owns the counter and releasing here would drift
    // it negative.
    if (!documentCreated) await releaseOrganizationUsage(ctx.org.id, "documents.count", 1);
    throw err;
  }
}

async function rollbackTaskDocument(
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
    console.error("createTaskDocument: rollback failed", rollbackError);
  }
}
