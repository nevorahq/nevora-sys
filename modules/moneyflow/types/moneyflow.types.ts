import type {
  AccountType,
  AnyTransactionType,
  CategorizationStatus,
  CategorySource,
  CategoryType,
  SuggestionStatus,
} from "../constants/moneyflow.constants";

/**
 * MoneyFlow domain types.
 *
 * Каждый тип соответствует 1:1 колонкам таблицы в PostgreSQL.
 * Это "паспорт" объекта — описывает все поля, которые существуют.
 *
 * Почему отдельно от Zod-схем:
 * - Тип = полная запись из БД (включая id, created_at)
 * - Zod-схема = подмножество полей для создания/обновления
 * - Тип используется в queries и components
 * - Zod-схема используется в actions (валидация входных данных)
 */

// ── Account ──
export type MoneyAccount = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// ── Category ──
export type MoneyCategory = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// ── Transaction ──
export type MoneyTransaction = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: AnyTransactionType;
  amount: number;
  currency: string;
  destination_amount: number | null;
  destination_currency: string | null;
  reference_exchange_rate: number | null;
  effective_exchange_rate: number | null;
  exchange_rate_source: "manual" | "bank_api" | "global" | "custom" | null;
  exchange_rate_id: string | null;
  transaction_date: string; // ISO date: "2024-12-31"
  title: string;
  note: string | null;
  // Transfer-only: the two accounts a `type='transfer'` row moves money between.
  // NULL for income/expense rows (DB CHECK, migration 067).
  from_account_id: string | null;
  to_account_id: string | null;
  // Money Intelligence (migration 069). Transfers carry no category and stay
  // 'uncategorized' — categorization queries always filter by type.
  categorization_status: CategorizationStatus;
  category_source: CategorySource | null;
  category_confidence: number | null;
  merchant_name?: string | null;
  normalized_merchant_name?: string | null;
  created_at: string;
  updated_at: string;
};

// ── AI category suggestion (money_ai_suggestions, migration 069) ──
export type MoneyAiSuggestion = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  transaction_id: string;
  suggested_category_id: string | null;
  suggested_category_name: string | null;
  suggested_type: CategoryType | null;
  merchant_name: string | null;
  normalized_merchant_name: string | null;
  confidence: number;
  reasoning: string | null;
  tags: string[];
  source: "history" | "system" | "ai";
  status: SuggestionStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/**
 * Transaction с присоединёнными данными (JOIN).
 *
 * Зачем: при отображении транзакции нужно показать
 * имя счёта и имя категории, а не UUID.
 * Supabase .select("*, account:money_accounts(name), category:money_categories(name)")
 * вернёт этот тип.
 */
export type MoneyTransactionWithRelations = MoneyTransaction & {
  account: { name: string } | null;
  category: { name: string } | null;
  // Joined for transfer rows so the ledger can render "From → To" by name.
  from_account: { name: string } | null;
  to_account: { name: string } | null;
};

// ── Summary (для Dashboard) ──
/**
 * Финансовое summary по ОДНОЙ валюте.
 *
 * USD-транзакции и MDL-транзакции считаются раздельно; `BaseSummary`
 * дополнительно нормализует их через organizational/global FX resolver.
 */
export type CurrencySummary = {
  currency: string;
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
};

/**
 * Итог, приведённый к базовой валюте организации через единый FX resolver.
 */
export type BaseSummary = {
  currency: string;
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  /** false — если для какой-то валюты не нашёлся курс; итог неполный. */
  complete: boolean;
};

export type MoneySummary = {
  /** Разбивка по валютам. Пусто — если нет ни счетов, ни транзакций. */
  byCurrency: CurrencySummary[];
  /** Сводный итог в базовой валюте. */
  base: BaseSummary;
};
