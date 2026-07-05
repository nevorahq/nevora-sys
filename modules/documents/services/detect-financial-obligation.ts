import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { logger } from "@/lib/observability/logger";
import { createFinancialTask } from "@/modules/tasks/services/create-financial-task";
import { DEFAULT_REMINDER_OFFSET_DAYS } from "@/modules/tasks/constants/task.constants";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";
import {
  classifyFinancialDocumentType,
  OBLIGATION_AUTO_CREATE,
  OBLIGATION_SUGGEST_FLOOR,
} from "./classify-financial-document";

/**
 * Financial-obligation detection (spec §9–§11). Turns an AI-extracted document
 * into a decision about whether — and how — to create a Financial Context Task.
 *
 * Money-safe: this path NEVER posts a transaction. High confidence may create a
 * planned obligation TASK; a posted expense only ever comes from Mark-as-paid.
 *
 * The pure classifier lives in ./classify-financial-document (re-exported here
 * for callers that already import from this module).
 */
export { classifyFinancialDocumentType } from "./classify-financial-document";
export type { FinancialClassification } from "./classify-financial-document";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ObligationDecision = {
  detected: boolean;
  autoCreated: boolean;
  taskId: string | null;
  band: "high" | "medium" | "low" | "none";
  reason: string;
};

/**
 * Evaluate + (optionally) act on a detected obligation for a document.
 *
 *   high (>=0.85) + has a due date  → auto-create the financial task
 *   medium (0.60..0.85)             → suggestion only (document detail offers "Create task")
 *   low (<0.60) / no due date       → surfaced for manual review, no task
 *
 * Never throws; failures degrade to "no task created".
 */
export async function detectFinancialObligation(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  params: { documentId: string; extracted: ExtractedFinancialDocument },
): Promise<ObligationDecision> {
  const { documentId, extracted } = params;
  const classification = classifyFinancialDocumentType(extracted);

  if (!classification) {
    return { detected: false, autoCreated: false, taskId: null, band: "none", reason: "No financial obligation detected." };
  }

  // Record that we extracted a financial obligation signal (drives analytics +
  // the document-detail suggestion, which reads normalized_json).
  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "document.financial_data_extracted",
    aggregateType: "document",
    aggregateId: documentId,
    payload: {
      context_type: classification.contextType,
      recurring: classification.recurring,
      provider_name: classification.providerName,
      financial_due_date: classification.financialDueDate,
      amount: classification.amount,
      currency: classification.currency,
      confidence: classification.confidence,
    },
  }).catch(() => undefined);

  const band = classification.confidence >= OBLIGATION_AUTO_CREATE
    ? "high"
    : classification.confidence >= OBLIGATION_SUGGEST_FLOOR
      ? "medium"
      : "low";

  const canAutoCreate =
    band === "high" &&
    !!classification.financialDueDate &&
    ISO_DATE_RE.test(classification.financialDueDate) &&
    !!classification.amount &&
    classification.amount > 0 &&
    !!classification.currency;

  if (!canAutoCreate) {
    const reason =
      band === "low"
        ? "Low-confidence obligation — shown for manual review only."
        : "Obligation detected — confirm to create a financial task.";
    return { detected: true, autoCreated: false, taskId: null, band, reason };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "financial_obligation.detected",
    aggregateType: "document",
    aggregateId: documentId,
    payload: { context_type: classification.contextType, confidence: classification.confidence },
  }).catch(() => undefined);

  const created = await createFinancialTask(supabase, ctx, {
    contextType: classification.contextType,
    providerName: classification.providerName,
    amount: classification.amount,
    currency: classification.currency,
    financialDueDate: classification.financialDueDate as string,
    reminderOffsetDays: DEFAULT_REMINDER_OFFSET_DAYS,
    sourceType: "document",
    sourceId: documentId,
    sourceDocumentId: documentId,
    confidence: classification.confidence,
  });

  if (!created.ok) {
    logger.error("obligation.auto_create_failed", { documentId, error: created.error });
    return { detected: true, autoCreated: false, taskId: null, band, reason: created.error };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "financial_obligation.task_created",
    aggregateType: "task",
    aggregateId: created.taskId,
    payload: { document_id: documentId, context_type: classification.contextType },
  }).catch(() => undefined);

  return {
    detected: true,
    autoCreated: created.created,
    taskId: created.taskId,
    band,
    reason: created.created ? "Financial task created from document." : "Financial task already existed for this document.",
  };
}
