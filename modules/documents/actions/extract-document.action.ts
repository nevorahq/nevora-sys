"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { hasDocumentPermission } from "../services/document-permissions";
import { isFinancialDocumentType } from "../constants/document.constants";
import { enqueueDocumentExtraction, runDocumentExtraction } from "../services/document-extraction-service";

/**
 * Run (or re-run) the Document-to-Transaction extraction pipeline for one
 * document. Permission + ownership + financial-type are enforced server-side;
 * org/workspace come from the authenticated context, never the client.
 *
 * Enqueues the job synchronously (so the UI immediately shows 'processing') and
 * runs the heavy work AFTER the response via Next `after()`. The client polls
 * the document detail page for the result.
 */
export async function extractDocumentAction(documentId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(documentId).success) {
    return { error: "Invalid document ID." };
  }

  const ctx = await requireOrg();
  if (!hasDocumentPermission(ctx, "document.create")) {
    return { error: "You do not have permission to extract documents." };
  }

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, doc_type")
    .eq("id", documentId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!document) return { error: "Document not found." };
  if (!isFinancialDocumentType(document.doc_type as string)) {
    return { error: "This document type can't be turned into a transaction." };
  }

  const enqueued = await enqueueDocumentExtraction(supabase, ctx, documentId);
  if (!enqueued.ok) {
    if (enqueued.reason === "already_running") {
      // Idempotent: a run is already in flight, let the UI poll it.
      revalidatePath(`${ROUTES.documents}/${documentId}`);
      return {};
    }
    return { error: enqueued.message };
  }

  const extractionId = enqueued.extractionId;
  after(async () => {
    try {
      const bgSupabase = await createClient();
      const bgCtx = await requireOrg();
      await runDocumentExtraction(bgSupabase, bgCtx, documentId, extractionId);
    } catch (err) {
      console.error("extractDocumentAction: background extraction failed", err);
    }
  });

  revalidatePath(`${ROUTES.documents}/${documentId}`);
  revalidatePath(ROUTES.actions);
  return {};
}
