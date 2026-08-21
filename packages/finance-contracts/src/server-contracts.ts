import type { MoneyAccountOption } from "./account-option";

/** Advisory duplicate-ledger check; the caller keeps the final decision. */
export interface FindDuplicateTransactionInput {
  merchantName: string | null;
  totalAmount: number | null;
  currency: string | null;
  transactionDate: string | null;
  excludeDocumentId?: string;
}

export interface DuplicateTransactionMatch {
  isDuplicate: boolean;
  matchedTransactionId: string | null;
}

/** Distinguishes "no accounts in this currency" from "the lookup itself failed". */
export type FindActiveMoneyAccountsResult =
  | { ok: true; accounts: MoneyAccountOption[] }
  | { ok: false; error: string };
