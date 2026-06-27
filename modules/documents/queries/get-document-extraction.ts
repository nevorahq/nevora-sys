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
  draftTransaction: {
    id: string;
    amount: number;
    currency: string;
    merchant_name: string | null;
    transaction_date: string | null;
    status: string;
    note: string | null;
    account_id: string | null;
  } | null;
  /** Active accounts the user can post the draft onto (for the currency picker). */
  accounts: { id: string; name: string; currency: string }[];
}

/**
 * Load the latest extraction state for a document plus its normalized data and
 * the draft (planned) transaction, if one was created. Org-scoped + RLS.
 */
export async function getDocumentExtractionState(
  orgId: string,
  documentId: string,
): Promise<DocumentExtractionState> {
  const supabase = await createClient();

  const [extractionRes, financialRes, itemsRes, draftRes, accountsRes] = await Promise.all([
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
      .from("money_transactions")
      .select("id, amount, currency, merchant_name, transaction_date, status, note, account_id")
      .eq("organization_id", orgId)
      .eq("source_document_id", documentId)
      .is("deleted_at", null)
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
  ]);

  return {
    extraction: (extractionRes.data as DocumentExtraction | null) ?? null,
    financialData: (financialRes.data as FinancialDocumentData | null) ?? null,
    items: (itemsRes.data as FinancialDocumentItem[] | null) ?? [],
    draftTransaction: draftRes.data
      ? {
          id: draftRes.data.id as string,
          amount: Number(draftRes.data.amount),
          currency: draftRes.data.currency as string,
          merchant_name: (draftRes.data.merchant_name as string | null) ?? null,
          transaction_date: (draftRes.data.transaction_date as string | null) ?? null,
          status: draftRes.data.status as string,
          note: (draftRes.data.note as string | null) ?? null,
          account_id: (draftRes.data.account_id as string | null) ?? null,
        }
      : null,
    accounts: (accountsRes.data as { id: string; name: string; currency: string }[] | null) ?? [],
  };
}
