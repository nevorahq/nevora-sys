import type { TaskContextType } from "../constants/task.constants";

/**
 * Deterministic keys + titles for Financial Context Tasks. Pure string builders —
 * trivially unit-testable, and shared by the detection service, the create-task
 * service and the Mark-as-paid flow.
 */

const TITLE_MAX = 200;

/** Verb per context type — drives the human-readable task title. */
const CONTEXT_VERB: Record<Exclude<TaskContextType, "standard">, (provider: string) => string> = {
  subscription_payment:    (p) => `Review ${p} subscription payment`,
  invoice_payment:         (p) => `Pay ${p} invoice`,
  tax_payment:             (p) => `Prepare ${p} payment`,
  domain_renewal:          (p) => `Renew ${p} domain`,
  hosting_payment:         (p) => `Pay ${p} hosting`,
  client_invoice_followup: (p) => `Follow up ${p} invoice`,
  expense_review:          (p) => `Review ${p} expense`,
  document_review:         (p) => `Review ${p} document`,
};

/**
 * Human-readable financial task title, e.g.:
 *   hosting_payment + "Hetzner"   -> "Pay Hetzner hosting"
 *   domain_renewal  + "nevora.com" -> "Renew nevora.com domain"
 *   tax_payment     + "VAT"        -> "Prepare VAT payment"
 */
export function buildFinancialTaskTitle(
  contextType: Exclude<TaskContextType, "standard">,
  providerName: string | null | undefined,
): string {
  const provider = (providerName ?? "").trim() || "obligation";
  const builder = CONTEXT_VERB[contextType];
  const title = builder ? builder(provider) : `Pay ${provider}`;
  return title.slice(0, TITLE_MAX);
}

/**
 * Idempotency key for a financial task derived from a source obligation. Matches
 * the (organization_id, financial_source_type, financial_source_id) unique index
 * on todos so re-detecting the same document/cycle can never create a duplicate
 * task.
 *
 *   document           -> "financial_obligation:document:{documentId}"
 *   subscription cycle -> handled by the subscription workflow (078), not here.
 */
export function buildFinancialObligationIdempotencyKey(
  sourceType: string,
  sourceId: string,
): string {
  return `financial_obligation:${sourceType}:${sourceId}`;
}

/**
 * Conceptual idempotency key for the posted expense created on Mark-as-paid.
 * money_transactions has no idempotency column; the real guard is
 * todos.financial_transaction_id (+ the row lock in mark_financial_task_paid).
 * Recorded in the paid event/audit metadata for traceability.
 */
export function buildFinancialTaskExpenseIdempotencyKey(taskId: string): string {
  return `financial_task:${taskId}:transaction`;
}

/** Description for the posted expense, e.g. "Hetzner — hosting payment". */
export function buildFinancialTaskExpenseTitle(
  providerName: string | null | undefined,
  contextType: Exclude<TaskContextType, "standard">,
): string {
  const provider = (providerName ?? "").trim() || "Expense";
  const label = contextType.replace(/_/g, " ");
  return `${provider} — ${label}`.slice(0, TITLE_MAX);
}
