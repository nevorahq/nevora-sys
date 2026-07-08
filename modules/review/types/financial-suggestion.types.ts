import type {
  FinancialSuggestionType,
  ReviewState,
  SubscriptionTaskSuggestionType,
} from "../constants/review.constants";

export interface FinancialSuggestion {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  source_type: "document" | "subscription" | "relation";
  source_id: string;
  suggestion_type: FinancialSuggestionType;
  review_state: ReviewState;
  amount: number | null;
  currency: string | null;
  vendor_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  document_type: string | null;
  tax_amount: number | null;
  payment_status: string | null;
  confidence_score: number | null;
  category_id: string | null;
  expense_context_id: string | null;
  billing_period_key: string | null;
  idempotency_key: string | null;
  created_transaction_id: string | null;
  created_task_id: string | null;
  rejected_reason: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const FINANCIAL_SUGGESTION_COLUMNS =
  "id, organization_id, workspace_id, source_type, source_id, suggestion_type, review_state, amount, currency, vendor_name, issue_date, due_date, document_type, tax_amount, payment_status, confidence_score, category_id, expense_context_id, billing_period_key, idempotency_key, created_transaction_id, created_task_id, rejected_reason, metadata, created_by, updated_by, created_at, updated_at" as const;

export interface CreateDocumentSuggestionInput {
  documentId: string;
  extractionId: string | null;
  vendorName: string | null;
  amount: number | null;
  currency: string | null;
  issueDate: string | null;
  dueDate: string | null;
  documentType: string | null;
  taxAmount: number | null;
  paymentStatus: string | null;
  confidenceScore: number | null;
  rawExtractionJson: Record<string, unknown>;
  categoryId?: string | null;
  expenseContextId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionTaskSuggestionInput {
  subscriptionId: string;
  taskType: SubscriptionTaskSuggestionType;
  billingPeriodKey?: string | null;
  dueDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  reason?: string | null;
  confidenceScore?: number | null;
  metadata?: Record<string, unknown>;
}

export type SuggestionActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
