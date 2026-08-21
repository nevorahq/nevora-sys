import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DuplicateTransactionMatch,
  FindActiveMoneyAccountsResult,
  FindDuplicateTransactionInput,
  MoneyAccount,
  MoneyAccountOption,
} from "@nevora/finance-contracts";

/** Active accounts for the organization, oldest first (first added = primary). */
export async function getAccounts(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MoneyAccount[]> {
  const { data, error } = await supabase
    .from("money_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[finance-runtime] getAccounts failed:", error.message);
    return [];
  }
  return data as MoneyAccount[];
}

/**
 * Active accounts in one currency. Returns a distinct `ok:false` (not an
 * empty result) on a genuine lookup failure — callers use this as an
 * existence check before creating an account, and treating a failed lookup
 * as "none found" could create a redundant account for a real duplicate the
 * query never got to see.
 */
export async function findActiveMoneyAccountsByCurrency(
  supabase: SupabaseClient,
  organizationId: string,
  currency: string,
): Promise<FindActiveMoneyAccountsResult> {
  const { data, error } = await supabase
    .from("money_accounts")
    .select("id, name, currency")
    .eq("organization_id", organizationId)
    .eq("currency", currency)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[finance-runtime] findActiveMoneyAccountsByCurrency failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, accounts: (data ?? []) as MoneyAccountOption[] };
}

/**
 * Find an existing transaction with the same financial identity. The check is
 * advisory: callers surface a warning and keep the final decision with the user.
 */
export async function findDuplicateTransaction(
  supabase: SupabaseClient,
  organizationId: string,
  input: FindDuplicateTransactionInput,
): Promise<DuplicateTransactionMatch> {
  if (input.totalAmount == null || !input.currency) {
    return { isDuplicate: false, matchedTransactionId: null };
  }

  let query = supabase
    .from("money_transactions")
    .select("id, source_document_id")
    .eq("organization_id", organizationId)
    .eq("amount", input.totalAmount)
    .eq("currency", input.currency)
    .is("deleted_at", null)
    .limit(5);

  if (input.merchantName) query = query.eq("merchant_name", input.merchantName);
  if (input.transactionDate) query = query.eq("transaction_date", input.transactionDate);

  const { data, error } = await query;
  if (error || !data?.length) {
    return { isDuplicate: false, matchedTransactionId: null };
  }

  const match = data.find((row) => row.source_document_id !== input.excludeDocumentId);
  return match
    ? { isDuplicate: true, matchedTransactionId: match.id as string }
    : { isDuplicate: false, matchedTransactionId: null };
}
