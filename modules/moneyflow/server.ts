import "server-only";

export { getAccounts } from "./queries/get-accounts";
export { getAccountsWithBalances } from "./queries/get-accounts-with-balances";
export type { AccountWithBalance } from "./queries/get-accounts-with-balances";
export { getCategories } from "./queries/get-categories";
export { getTransactions } from "./queries/get-transactions";
export { getMoneySummary } from "./queries/get-money-summary";
export { getUpcomingExpenses } from "./queries/get-upcoming-expenses";
export type { UpcomingExpenses } from "./queries/get-upcoming-expenses";
export { getExchangeRateOverview } from "./queries/get-exchange-rates";
export { getPlannedTransactions } from "./queries/get-planned-transactions";
export { getExpenseBreakdown } from "./queries/get-expense-breakdown";
export { getCategoryIntelligence } from "./queries/get-category-intelligence";
export {
  getUncategorizedCount,
  getUncategorizedTransactions,
} from "./queries/get-uncategorized-transactions";
export { getCategorizationDiagnostics } from "./queries/get-categorization-diagnostics";
export { getCategoryRules } from "./queries/get-category-rules";

export { expireStaleSuggestions } from "./services/expire-stale-suggestions";
export { findDuplicateTransaction } from "./services/duplicate-detection";
export type { DuplicateTransactionMatch } from "./services/duplicate-detection";
export { seedDefaultMoneyAccount } from "./services/money-account-service";
export {
  createMoneyAccount,
  findActiveMoneyAccountsByCurrency,
} from "./services/money-account-service";
export type { MoneyAccountOption } from "./services/money-account-service";
export {
  classifyExpense,
  normalizeMerchantName,
  upsertPrivateMerchantRule,
} from "./services/expense-classifier";
