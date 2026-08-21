import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Result of checking a prospective ledger transaction for a likely duplicate. */
export interface DuplicateTransactionMatch {
  isDuplicate: boolean;
  matchedTransactionId: string | null;
}

/**
 * Find an existing transaction with the same financial identity. The check is
 * advisory: callers surface a warning and keep the final decision with the user.
 */
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
): Promise<DuplicateTransactionMatch> {
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

  if (params.merchantName) query = query.eq("merchant_name", params.merchantName);
  if (params.transactionDate) query = query.eq("transaction_date", params.transactionDate);

  const { data, error } = await query;
  if (error || !data?.length) {
    return { isDuplicate: false, matchedTransactionId: null };
  }

  const match = data.find((row) => row.source_document_id !== params.excludeDocumentId);
  return match
    ? { isDuplicate: true, matchedTransactionId: match.id as string }
    : { isDuplicate: false, matchedTransactionId: null };
}
