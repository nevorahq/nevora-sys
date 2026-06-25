import type { AccountType, TransactionType, CategoryType } from "../constants/moneyflow.constants";

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
  type: TransactionType;
  amount: number;
  currency: string;
  transaction_date: string; // ISO date: "2024-12-31"
  title: string;
  note: string | null;
  created_at: string;
  updated_at: string;
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
};

// ── Summary (для Dashboard) ──
/**
 * Финансовое summary по ОДНОЙ валюте.
 *
 * Суммы НЕ конвертируются: USD-транзакции и MDL-транзакции считаются
 * раздельно. Кросс-валютная нормализация в base_currency — отдельный
 * FX-слой (exchange_rates + fn_get_exchange_rate), пока не внедрён.
 */
export type CurrencySummary = {
  currency: string;
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
};

/**
 * Итог, приведённый к базовой валюте организации через fn_get_exchange_rate.
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
