"use server";

import { createAccountAction as createAccount } from "./actions/create-account.action";
import { updateAccountAction as updateAccount } from "./actions/update-account.action";
import { deactivateAccountAction as deactivateAccount } from "./actions/deactivate-account.action";
import { createTransactionAction as createTransaction } from "./actions/create-transaction.action";
import { updateTransactionAction as updateTransaction } from "./actions/update-transaction.action";
import { deleteTransactionAction as deleteTransaction } from "./actions/delete-transaction.action";
import { confirmDocumentTransactionAction as confirmDocumentTransaction } from "./actions/confirm-document-transaction.action";
import { rejectDocumentTransactionAction as rejectDocumentTransaction } from "./actions/reject-document-transaction.action";
import { createAccountForDocumentExpenseAction as createAccountForDocumentExpense } from "./actions/create-account-for-document-expense.action";

export async function createAccountAction(...args: Parameters<typeof createAccount>) {
  return createAccount(...args);
}

export async function updateAccountAction(...args: Parameters<typeof updateAccount>) {
  return updateAccount(...args);
}

export async function deactivateAccountAction(...args: Parameters<typeof deactivateAccount>) {
  return deactivateAccount(...args);
}

export async function createTransactionAction(...args: Parameters<typeof createTransaction>) {
  return createTransaction(...args);
}

export async function updateTransactionAction(...args: Parameters<typeof updateTransaction>) {
  return updateTransaction(...args);
}

export async function deleteTransactionAction(...args: Parameters<typeof deleteTransaction>) {
  return deleteTransaction(...args);
}

export async function confirmDocumentTransactionAction(
  ...args: Parameters<typeof confirmDocumentTransaction>
) {
  return confirmDocumentTransaction(...args);
}

export async function rejectDocumentTransactionAction(
  ...args: Parameters<typeof rejectDocumentTransaction>
) {
  return rejectDocumentTransaction(...args);
}

export async function createAccountForDocumentExpenseAction(
  ...args: Parameters<typeof createAccountForDocumentExpense>
) {
  return createAccountForDocumentExpense(...args);
}
