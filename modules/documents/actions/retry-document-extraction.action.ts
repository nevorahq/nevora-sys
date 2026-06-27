"use server";

import { emitAuditLog } from "@/lib/events";
import { requireOrg } from "@/lib/auth/require-org";
import type { ActionResult } from "@/lib/validators/common";
import { extractDocumentAction } from "./extract-document.action";

/**
 * Retry extraction for a document whose previous run failed or needs review.
 * Re-uses the orchestrator (a fresh document_extractions job is created); the
 * in-flight unique index still prevents two concurrent runs.
 */
export async function retryDocumentExtractionAction(documentId: string): Promise<ActionResult> {
  const result = await extractDocumentAction(documentId);

  if (!result.error) {
    const ctx = await requireOrg();
    await emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "documents",
      entityId: documentId,
      action: "update",
      newData: { extraction: "retried" },
      metadata: { source: "dashboard" },
    });
  }

  return result;
}
