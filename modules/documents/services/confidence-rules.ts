import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";

/**
 * Confidence-based workflow (spec §11). Pure + side-effect-free so it can be
 * unit-tested without a database.
 *
 *   overall >= 0.85          → draft transaction + "confirm" action
 *   0.65 <= overall < 0.85   → draft transaction + "review fields" action
 *   overall < 0.65           → NO transaction + "review extraction" action
 *
 * A draft is only created when the required fields are present:
 *   total amount, currency, date (created_at fallback), merchant (fallback).
 */

export const CONFIDENCE_AUTO_DRAFT = 0.85;
export const CONFIDENCE_REVIEW_FLOOR = 0.65;

export type ExtractionDecision = {
  /** Create a draft (planned) money transaction. */
  createTransaction: boolean;
  /** Extraction row status to persist. */
  extractionStatus: "completed" | "needs_review";
  /** Action Center item type to open for the user. */
  actionItemType: "draft_review" | "document_review";
  /** Flag fields for review in the UI (medium-confidence band). */
  requiresFieldReview: boolean;
  /** Human-readable reason, stored on the action item / extraction. */
  reason: string;
};

/** Required fields for a draft transaction are derivable (with fallbacks). */
export function hasRequiredTransactionFields(
  extracted: ExtractedFinancialDocument,
): boolean {
  const total = extracted.transaction.total;
  const hasTotal = typeof total === "number" && Number.isFinite(total) && total > 0;
  const hasCurrency = Boolean(extracted.transaction.currency);
  // date + merchant always resolve via fallbacks (created_at / "Unknown merchant").
  return hasTotal && hasCurrency;
}

export function evaluateExtraction(
  extracted: ExtractedFinancialDocument,
): ExtractionDecision {
  const overall = extracted.confidence.overall;
  const hasFields = hasRequiredTransactionFields(extracted);

  if (!hasFields) {
    return {
      createTransaction: false,
      extractionStatus: "needs_review",
      actionItemType: "document_review",
      requiresFieldReview: true,
      reason: "Required fields (total amount or currency) could not be read. Please review the document.",
    };
  }

  if (overall >= CONFIDENCE_AUTO_DRAFT) {
    return {
      createTransaction: true,
      extractionStatus: "completed",
      actionItemType: "draft_review",
      requiresFieldReview: false,
      reason: "High-confidence extraction. Review and confirm the drafted expense.",
    };
  }

  if (overall >= CONFIDENCE_REVIEW_FLOOR) {
    return {
      createTransaction: true,
      extractionStatus: "needs_review",
      actionItemType: "draft_review",
      requiresFieldReview: true,
      reason: "Medium-confidence extraction. Some fields may need correction before confirming.",
    };
  }

  return {
    createTransaction: false,
    extractionStatus: "needs_review",
    actionItemType: "document_review",
    requiresFieldReview: true,
    reason: "Low-confidence extraction. Review the document before creating a transaction.",
  };
}
