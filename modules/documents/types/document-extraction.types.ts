/**
 * Document-to-Transaction — extraction domain types.
 * Mirror the columns/CHECKs of migration 051.
 */

export const EXTRACTION_PROVIDERS = [
  "pdf_parse",
  "anthropic_vision",
  "openai",
  "google_vision",
  "azure_document_intelligence",
  "mindee",
  "veryfi",
  "manual",
] as const;
export type ExtractionProvider = (typeof EXTRACTION_PROVIDERS)[number];

export const EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "needs_review",
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** Controlled error codes surfaced to the UI + stored on the extraction row. */
export const EXTRACTION_ERROR_CODES = [
  "unsupported_file_type",
  "file_too_large",
  "storage_download_failed",
  "pdf_parse_failed",
  "ocr_failed",
  "ai_normalization_failed",
  "schema_validation_failed",
  "usage_limit_exceeded",
  "permission_denied",
  "transaction_creation_failed",
  "no_attachment",
  "unknown_error",
] as const;
export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

export interface DocumentExtraction {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  document_id: string;
  provider: ExtractionProvider;
  status: ExtractionStatus;
  raw_text: string | null;
  raw_json: Record<string, unknown> | null;
  normalized_json: Record<string, unknown> | null;
  confidence_score: number | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export const DOCUMENT_EXTRACTION_COLUMNS =
  "id, organization_id, workspace_id, document_id, provider, status, raw_text, raw_json, normalized_json, confidence_score, error_code, error_message, started_at, completed_at, created_by, created_at" as const;

export interface FinancialDocumentData {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  document_id: string;
  extraction_id: string | null;
  document_type: "receipt" | "invoice" | "payment_confirmation" | "unknown";
  merchant_name: string | null;
  merchant_tax_id: string | null;
  document_number: string | null;
  transaction_date: string | null;
  currency: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  payment_method: string | null;
  suggested_category_id: string | null;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

export const FINANCIAL_DOCUMENT_DATA_COLUMNS =
  "id, organization_id, workspace_id, document_id, extraction_id, document_type, merchant_name, merchant_tax_id, document_number, transaction_date, currency, subtotal_amount, tax_amount, total_amount, payment_method, suggested_category_id, confidence_score, created_at, updated_at" as const;

export interface FinancialDocumentItem {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  document_id: string;
  extraction_id: string | null;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  tax_rate: number | null;
  suggested_category_id: string | null;
  created_at: string;
}

export const FINANCIAL_DOCUMENT_ITEM_COLUMNS =
  "id, organization_id, workspace_id, document_id, extraction_id, name, quantity, unit_price, total_price, tax_rate, suggested_category_id, created_at" as const;
