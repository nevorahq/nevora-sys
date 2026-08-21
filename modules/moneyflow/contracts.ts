/** Stable, runtime-safe public contracts for the Money product. */

export type {
  MoneyAccount,
  MoneyCategory,
  MoneyTransaction,
  MoneyTransactionWithRelations,
  MoneySummary,
  CurrencySummary,
  BaseSummary,
  TransactionSubscriptionOption,
} from "./types/moneyflow.types";

export {
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
  CATEGORY_TYPES,
  DEFAULT_CURRENCY,
  ACCOUNT_NAME_MAX,
  CATEGORY_NAME_MAX,
  TRANSACTION_TITLE_MAX,
  TRANSACTION_NOTE_MAX,
} from "./constants/moneyflow.constants";
export type { AccountType, TransactionType, CategoryType } from "./constants/moneyflow.constants";

export { resolveMonthRange } from "./lib/month-range";
export type { MonthRange } from "./lib/month-range";
export {
  CANONICAL_FINANCIAL_STATES,
  toCanonicalFinancialState,
} from "@nevora/financial-state/contracts";
export type {
  CanonicalFinancialState,
  FinancialSurface,
  CanonicalStateOptions,
} from "@nevora/financial-state/contracts";

export type { MoneyAccountOption } from "./services/money-account-service";
export type { InlineAccountCreationResult } from "./actions/create-account-for-document-expense.action";
