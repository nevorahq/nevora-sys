-- ============================================================
-- MoneyFlow Module — Database Schema
-- ============================================================
-- Зависимости:
--   - auth.users (Supabase Auth)
--   - public.handle_updated_at() (из schema.sql — уже существует)
--
-- Порядок: таблицы → индексы → триггеры → RLS
-- Выполняй в Supabase SQL Editor ПОСЛЕ schema.sql
-- ============================================================


-- ============================================================
-- 1. ТАБЛИЦА: money_accounts
-- ============================================================
-- Счета пользователя: наличные, карта, банк, накопления и т.д.
--
-- initial_balance: начальный баланс при создании счёта.
--   Зачем: пользователь добавляет существующий счёт с 5000 на карте.
--   Без initial_balance — баланс будет 0 до первой транзакции.
--
-- numeric(14,2): до 999 999 999 999.99 — достаточно для любой валюты.
--   Почему не float: float имеет ошибки округления (0.1 + 0.2 ≠ 0.3).
--   Для денег ВСЕГДА используй numeric/decimal.
--
-- is_active: мягкое удаление. Деактивированный счёт не показывается
--   в UI, но транзакции сохраняются для истории.
--   Почему не DELETE: удаление счёта каскадно удалит транзакции.
--   Финансовая история не должна исчезать.

CREATE TABLE public.money_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('cash', 'card', 'bank', 'savings', 'other')),
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'MDL',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_accounts IS 'User financial accounts (cash, card, bank, etc.)';


-- ============================================================
-- 2. ТАБЛИЦА: money_categories
-- ============================================================
-- Категории доходов и расходов: Зарплата, Еда, Транспорт и т.д.
--
-- type: 'income' или 'expense'.
--   Категория привязана к типу транзакции.
--   "Зарплата" — только income. "Еда" — только expense.
--   Это предотвращает ошибку: создать расход в категории "Зарплата".
--
-- color/icon: для визуального отличия в UI.
--   Nullable — можно не задавать, UI покажет дефолтные.
--
-- is_default: системные категории, которые создаются при регистрации.
--   Пользователь не может удалить default-категории (бизнес-правило в UI).

CREATE TABLE public.money_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color      TEXT,
  icon       TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_categories IS 'Income and expense categories for MoneyFlow';


-- ============================================================
-- 3. ТАБЛИЦА: money_transactions
-- ============================================================
-- Основная таблица — каждая строка = одна финансовая операция.
--
-- amount > 0 — ВСЕГДА положительное число.
--   Тип операции (income/expense) хранится отдельно в `type`.
--   Баланс считается:
--     SUM(CASE WHEN type='income' THEN amount ELSE -amount END)
--
--   Почему не signed amount (отрицательные числа):
--   1. CHECK (amount > 0) — простая, невозможно ошибиться
--   2. UI: пользователь вводит "250", не "-250"
--   3. Фильтрация: WHERE type = 'expense' — явно и читаемо
--   4. Агрегация: SUM с CASE — стандартный SQL-паттерн для финансов
--
-- account_id: обязательный — транзакция без счёта невозможна.
--   ON DELETE CASCADE — удалил счёт → удалились его транзакции.
--
-- category_id: опциональный (nullable).
--   ON DELETE SET NULL — удалил категорию → транзакции остаются,
--   но без категории. Финансовые данные не должны исчезать.
--
-- transaction_date: DATE, не TIMESTAMPTZ.
--   "Я потратил 250 15 июня" — дата, не время.
--   Default = current_date (сегодня).

CREATE TABLE public.money_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES public.money_accounts(id) ON DELETE CASCADE,
  category_id      UUID REFERENCES public.money_categories(id) ON DELETE SET NULL,
  type             TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency         TEXT NOT NULL DEFAULT 'MDL',
  transaction_date DATE NOT NULL DEFAULT current_date,
  title            TEXT NOT NULL,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_transactions IS 'Income and expense transactions';


-- ============================================================
-- 4. ИНДЕКСЫ
-- ============================================================
-- Правило: индексируй колонки, которые используются в WHERE и ORDER BY.
-- НЕ индексируй всё подряд — каждый индекс замедляет INSERT/UPDATE.

-- money_accounts: все запросы фильтруют по user_id
-- RLS добавляет WHERE user_id = auth.uid() к КАЖДОМУ запросу,
-- поэтому индекс на user_id критически важен для производительности RLS.
CREATE INDEX idx_money_accounts_user_id
  ON public.money_accounts (user_id);

-- money_categories: user_id + type — для dropdown "Категории расходов"
-- Запрос: WHERE user_id = ? AND type = 'expense' → этот индекс
CREATE INDEX idx_money_categories_user_type
  ON public.money_categories (user_id, type);

-- money_transactions: user_id + date DESC — для "Последние транзакции"
-- Запрос: WHERE user_id = ? ORDER BY transaction_date DESC → этот индекс
CREATE INDEX idx_money_transactions_user_date
  ON public.money_transactions (user_id, transaction_date DESC);

-- money_transactions: account_id — для "Транзакции по счёту"
-- Запрос: WHERE account_id = ? → этот индекс
-- Также ускоряет RLS-проверку ownership при INSERT
CREATE INDEX idx_money_transactions_account
  ON public.money_transactions (account_id);

-- money_transactions: category_id — для "Транзакции по категории"
-- Также ускоряет JOIN при выводе имени категории
CREATE INDEX idx_money_transactions_category
  ON public.money_transactions (category_id);

-- money_transactions: user_id + type — для "Сумма расходов за месяц"
-- Запрос: WHERE user_id = ? AND type = 'expense' AND date BETWEEN → этот индекс
CREATE INDEX idx_money_transactions_user_type
  ON public.money_transactions (user_id, type);


-- ============================================================
-- 5. ТРИГГЕРЫ: автообновление updated_at
-- ============================================================
-- Используем ту же функцию handle_updated_at() из schema.sql.
-- Не создаём новую — DRY.

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.money_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.money_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.money_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 6. RLS POLICIES — Row Level Security
-- ============================================================
-- Включаем RLS — deny by default.

ALTER TABLE public.money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_transactions ENABLE ROW LEVEL SECURITY;


-- ── money_accounts ──

CREATE POLICY "Users can view own accounts"
  ON public.money_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own accounts"
  ON public.money_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own accounts"
  ON public.money_accounts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own accounts"
  ON public.money_accounts FOR DELETE
  USING (user_id = auth.uid());


-- ── money_categories ──

CREATE POLICY "Users can view own categories"
  ON public.money_categories FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own categories"
  ON public.money_categories FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own categories"
  ON public.money_categories FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own categories"
  ON public.money_categories FOR DELETE
  USING (user_id = auth.uid());


-- ── money_transactions ──
-- ВАЖНО: здесь RLS сложнее, чем для accounts/categories.
--
-- Проблема: простая политика `WITH CHECK (user_id = auth.uid())`
-- НЕ защищает от атаки "чужой account_id":
--
--   INSERT INTO money_transactions (user_id, account_id, ...)
--   VALUES (мой_uid, ЧУЖОЙ_account_id, ...)
--
--   user_id = auth.uid() → ОК ✓
--   Но account_id принадлежит другому пользователю! → утечка/подмена
--
-- Решение: EXISTS-подзапрос проверяет, что account_id и category_id
-- принадлежат текущему пользователю.
--
-- Аналогия: ты можешь положить деньги только в СВОЙ сейф,
-- а не в сейф соседа, даже если знаешь его номер.

CREATE POLICY "Users can view own transactions"
  ON public.money_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create transactions for own accounts and categories"
  ON public.money_transactions FOR INSERT
  WITH CHECK (
    -- 1. Транзакция принадлежит текущему пользователю
    user_id = auth.uid()

    -- 2. Счёт принадлежит текущему пользователю
    AND EXISTS (
      SELECT 1
      FROM public.money_accounts
      WHERE money_accounts.id = money_transactions.account_id
        AND money_accounts.user_id = auth.uid()
    )

    -- 3. Категория принадлежит текущему пользователю (или NULL)
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.money_categories
        WHERE money_categories.id = money_transactions.category_id
          AND money_categories.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own transactions with own accounts and categories"
  ON public.money_transactions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.money_accounts
      WHERE money_accounts.id = money_transactions.account_id
        AND money_accounts.user_id = auth.uid()
    )
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.money_categories
        WHERE money_categories.id = money_transactions.category_id
          AND money_categories.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete own transactions"
  ON public.money_transactions FOR DELETE
  USING (user_id = auth.uid());
