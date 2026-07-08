import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_EXTRACTION_COLUMNS,
  FINANCIAL_DOCUMENT_DATA_COLUMNS,
  FINANCIAL_DOCUMENT_ITEM_COLUMNS,
  type DocumentExtraction,
  type FinancialDocumentData,
  type FinancialDocumentItem,
} from "../types/document-extraction.types";

export interface DocumentExtractionState {
  extraction: DocumentExtraction | null;
  financialData: FinancialDocumentData | null;
  items: FinancialDocumentItem[];
  financialSuggestion: {
    id: string;
    amount: number | null;
    currency: string | null;
    vendor_name: string | null;
    issue_date: string | null;
    due_date: string | null;
    review_state: "detected" | "suggested" | "waiting_confirmation" | "confirmed" | "rejected";
    confidence_score: number | null;
    category_id: string | null;
    expense_context_id: string | null;
    created_transaction_id: string | null;
    rejected_reason: string | null;
    metadata: Record<string, unknown>;
  } | null;
  /** Active accounts the user can post the draft onto (for the currency picker). */
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  contexts: {
    id: string;
    slug: "personal" | "family" | "work";
    name: string;
    visibility: "organization" | "private";
  }[];
  classification: {
    method: string;
    reason: string;
    category_confidence: number | null;
    context_confidence: number | null;
  } | null;
}

/**
 * Load the latest extraction state for a document plus its normalized data and
 * the review-first financial suggestion, if one was created. Org-scoped + RLS.
 */
export async function getDocumentExtractionState(
  orgId: string,
  documentId: string,
): Promise<DocumentExtractionState> {
  const supabase = await createClient();

  const [extractionRes, financialRes, itemsRes, suggestionRes, accountsRes, categoriesRes, contextsRes] = await Promise.all([
    supabase
      .from("document_extractions")
      .select(DOCUMENT_EXTRACTION_COLUMNS)
      .eq("organization_id", orgId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("financial_document_data")
      .select(FINANCIAL_DOCUMENT_DATA_COLUMNS)
      .eq("organization_id", orgId)
      .eq("document_id", documentId)
      .maybeSingle(),
    supabase
      .from("financial_document_items")
      .select(FINANCIAL_DOCUMENT_ITEM_COLUMNS)
      .eq("organization_id", orgId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: true }),
    supabase
      .from("financial_suggestions")
      .select("id, amount, currency, vendor_name, issue_date, due_date, review_state, confidence_score, category_id, expense_context_id, created_transaction_id, rejected_reason, metadata")
      .eq("organization_id", orgId)
      .eq("source_type", "document")
      .eq("source_id", documentId)
      .eq("suggestion_type", "create_expense")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("money_accounts")
      .select("id, name, currency")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("money_categories")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("expense_contexts")
      .select("id, slug, name, visibility")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  let classification: DocumentExtractionState["classification"] = null;
  if (suggestionRes.data?.metadata && typeof suggestionRes.data.metadata === "object") {
    const metadata = suggestionRes.data.metadata as Record<string, unknown>;
    classification = {
      method: typeof metadata.classification_method === "string" ? metadata.classification_method : "suggestion",
      reason: typeof metadata.classification_reason === "string" ? metadata.classification_reason : "Review before confirming.",
      category_confidence: typeof metadata.category_confidence === "number" ? metadata.category_confidence : null,
      context_confidence: typeof metadata.context_confidence === "number" ? metadata.context_confidence : null,
    };
  }

  return {
    extraction: (extractionRes.data as DocumentExtraction | null) ?? null,
    financialData: (financialRes.data as FinancialDocumentData | null) ?? null,
    items: (itemsRes.data as FinancialDocumentItem[] | null) ?? [],
    financialSuggestion: suggestionRes.data
      ? {
          id: suggestionRes.data.id as string,
          amount: suggestionRes.data.amount == null ? null : Number(suggestionRes.data.amount),
          currency: (suggestionRes.data.currency as string | null) ?? null,
          vendor_name: (suggestionRes.data.vendor_name as string | null) ?? null,
          issue_date: (suggestionRes.data.issue_date as string | null) ?? null,
          due_date: (suggestionRes.data.due_date as string | null) ?? null,
          review_state: suggestionRes.data.review_state as "detected" | "suggested" | "waiting_confirmation" | "confirmed" | "rejected",
          confidence_score: suggestionRes.data.confidence_score == null ? null : Number(suggestionRes.data.confidence_score),
          category_id: (suggestionRes.data.category_id as string | null) ?? null,
          expense_context_id: (suggestionRes.data.expense_context_id as string | null) ?? null,
          created_transaction_id: (suggestionRes.data.created_transaction_id as string | null) ?? null,
          rejected_reason: (suggestionRes.data.rejected_reason as string | null) ?? null,
          metadata: (suggestionRes.data.metadata as Record<string, unknown> | null) ?? {},
        }
      : null,
    accounts: (accountsRes.data as { id: string; name: string; currency: string }[] | null) ?? [],
    categories: (categoriesRes.data as { id: string; name: string }[] | null) ?? [],
    contexts: (contextsRes.data as DocumentExtractionState["contexts"] | null) ?? [],
    classification,
  };
}
