import type { TaskContextType } from "@/modules/tasks/constants/task.constants";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";

/**
 * Pure financial-document classifier (spec §9). Side-effect free and free of
 * server imports so it can be unit-tested in isolation. The DB-touching decision
 * + task creation lives in ./detect-financial-obligation.
 */

// Obligation-specific confidence bands (spec §11). Distinct from the
// transaction-draft bands in confidence-rules.ts.
export const OBLIGATION_AUTO_CREATE = 0.85; // high → auto-create task
export const OBLIGATION_SUGGEST_FLOOR = 0.6; // medium → suggestion only

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FinancialClassification = {
  contextType: Exclude<TaskContextType, "standard">;
  recurring: boolean;
  providerName: string | null;
  /** Real payment date (YYYY-MM-DD) or null if the document didn't state one. */
  financialDueDate: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
};

/**
 * Map an extracted document to a financial-task classification, or null when the
 * document is not a future-dated obligation (e.g. an already-paid receipt).
 */
export function classifyFinancialDocumentType(
  extracted: ExtractedFinancialDocument,
): FinancialClassification | null {
  const ob = extracted.obligation;

  // The model explicitly flagged an obligation → trust its structured output.
  if (ob?.isFinancialObligation) {
    const contextType = mapObligationType(ob.obligationType, ob.billingInterval);
    const recurring = ob.billingInterval != null && ob.billingInterval !== "one_time";
    return {
      contextType,
      recurring,
      providerName: ob.providerName ?? extracted.merchant.name,
      financialDueDate: pickDate(ob.paymentDueDate, ob.nextPaymentDate),
      amount: extracted.transaction.total,
      currency: extracted.transaction.currency,
      confidence: clamp(ob.confidence || extracted.confidence.overall),
    };
  }

  // Heuristic fallback: an INVOICE (not a paid receipt) suggesting a task.
  const wantsTask = extracted.suggestedActions.some(
    (a) => a.type === "create_task" || a.type === "link_subscription",
  );
  if (extracted.documentType === "invoice" && wantsTask) {
    const recurring = extracted.suggestedActions.some((a) => a.type === "link_subscription");
    return {
      contextType: recurring ? "subscription_payment" : "invoice_payment",
      recurring,
      providerName: extracted.merchant.name,
      financialDueDate: null, // heuristic path has no explicit due date
      amount: extracted.transaction.total,
      currency: extracted.transaction.currency,
      confidence: clamp(extracted.confidence.overall),
    };
  }

  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function mapObligationType(
  obligationType: string | null,
  billingInterval: string | null,
): Exclude<TaskContextType, "standard"> {
  switch (obligationType) {
    case "tax_payment":
    case "domain_renewal":
    case "hosting_payment":
    case "subscription_payment":
    case "client_invoice_followup":
    case "invoice_payment":
      return obligationType;
    default:
      return billingInterval && billingInterval !== "one_time"
        ? "subscription_payment"
        : "invoice_payment";
  }
}

function pickDate(...candidates: (string | null)[]): string | null {
  for (const c of candidates) {
    if (c && ISO_DATE_RE.test(c)) return c;
  }
  return null;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
