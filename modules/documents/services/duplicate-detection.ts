import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Duplicate detection (spec §21). Before drafting a transaction we look for an
 * existing one in the same org with the same merchant + total + currency + date.
 * RLS scopes the query to the caller's org; we add an explicit org filter too.
 *
 * We never block silently — a likely duplicate is surfaced to the user as a
 * warning on the draft, not an auto-merge.
 */
export interface DuplicateMatch {
  isDuplicate: boolean;
  matchedTransactionId: string | null;
}

export async function findDuplicateTransaction(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    merchantName: string | null;
    totalAmount: number | null;
    currency: string | null;
    transactionDate: string | null;
    excludeDocumentId?: string;
  },
): Promise<DuplicateMatch> {
  if (params.totalAmount == null || !params.currency) {
    return { isDuplicate: false, matchedTransactionId: null };
  }

  let query = supabase
    .from("money_transactions")
    .select("id, source_document_id")
    .eq("organization_id", params.organizationId)
    .eq("amount", params.totalAmount)
    .eq("currency", params.currency)
    .is("deleted_at", null)
    .limit(5);

  if (params.merchantName) {
    query = query.eq("merchant_name", params.merchantName);
  }
  if (params.transactionDate) {
    query = query.eq("transaction_date", params.transactionDate);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    return { isDuplicate: false, matchedTransactionId: null };
  }

  // Ignore a transaction already drafted from this very document (re-extraction).
  const match = data.find((r) => r.source_document_id !== params.excludeDocumentId);
  return match
    ? { isDuplicate: true, matchedTransactionId: match.id as string }
    : { isDuplicate: false, matchedTransactionId: null };
}
