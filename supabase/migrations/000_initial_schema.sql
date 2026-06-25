-- ============================================================
-- Migration 000: Initial Schema
-- ============================================================
-- Содержит таблицы, которые существовали до системы миграций:
--   profiles, todos (из schema.sql)
--   money_accounts, money_categories, money_transactions (из moneyflow-schema.sql)
--   subscriptions (из subtracker-schema.sql)
--
-- ВАЖНО: эта миграция должна применяться ПЕРВОЙ.
-- Миграции 001+ зависят от этих таблиц.
-- ============================================================


-- ============================================================
-- 1. profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users';


-- ============================================================
-- 2. todos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.todos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.todos IS 'User tasks with priority and completion status';

-- Indexes are conditional: the todos table may already exist with a different schema
-- (multi-tenant schema uses organization_id instead of user_id).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'todos' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_todos_user_id        ON public.todos (user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_user_completed ON public.todos (user_id, is_completed);
    CREATE INDEX IF NOT EXISTS idx_todos_user_created   ON public.todos (user_id, created_at DESC);
  END IF;
END $$;


-- ============================================================
-- 3. Shared trigger function: handle_updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. Triggers
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.todos'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.todos
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;


-- ============================================================
-- 5. RLS — profiles и todos
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can view own profile') THEN
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT USING (id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- todos RLS only applies when the table has the old single-user schema (user_id column).
-- The multi-tenant schema (organization_id) gets its own RLS in later migrations.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'todos' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='todos' AND policyname='Users can view own todos') THEN
      CREATE POLICY "Users can view own todos"
        ON public.todos FOR SELECT USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='todos' AND policyname='Users can create own todos') THEN
      CREATE POLICY "Users can create own todos"
        ON public.todos FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='todos' AND policyname='Users can update own todos') THEN
      CREATE POLICY "Users can update own todos"
        ON public.todos FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='todos' AND policyname='Users can delete own todos') THEN
      CREATE POLICY "Users can delete own todos"
        ON public.todos FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;


-- ============================================================
-- 6. money_accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.money_accounts (
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

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_accounts' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_money_accounts_user_id ON public.money_accounts (user_id);
  END IF;
END $$;


-- ============================================================
-- 7. money_categories
-- ============================================================

CREATE TABLE IF NOT EXISTS public.money_categories (
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

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_categories' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_money_categories_user_type ON public.money_categories (user_id, type);
  END IF;
END $$;


-- ============================================================
-- 8. money_transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.money_transactions (
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

CREATE INDEX IF NOT EXISTS idx_money_transactions_account  ON public.money_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_money_transactions_category ON public.money_transactions (category_id);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_transactions' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_money_transactions_user_date ON public.money_transactions (user_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_money_transactions_user_type ON public.money_transactions (user_id, type);
  END IF;
END $$;


-- ============================================================
-- 9. Triggers for money tables
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.money_accounts'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.money_accounts
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.money_categories'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.money_categories
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.money_transactions'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.money_transactions
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;


-- ============================================================
-- 10. RLS — money tables
-- ============================================================

ALTER TABLE public.money_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_transactions ENABLE ROW LEVEL SECURITY;

-- money_accounts (conditional: only if user_id column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_accounts' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_accounts' AND policyname='Users can view own accounts') THEN
      CREATE POLICY "Users can view own accounts" ON public.money_accounts FOR SELECT USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_accounts' AND policyname='Users can create own accounts') THEN
      CREATE POLICY "Users can create own accounts" ON public.money_accounts FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_accounts' AND policyname='Users can update own accounts') THEN
      CREATE POLICY "Users can update own accounts" ON public.money_accounts FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_accounts' AND policyname='Users can delete own accounts') THEN
      CREATE POLICY "Users can delete own accounts" ON public.money_accounts FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;

-- money_categories (conditional: only if user_id column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_categories' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_categories' AND policyname='Users can view own categories') THEN
      CREATE POLICY "Users can view own categories" ON public.money_categories FOR SELECT USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_categories' AND policyname='Users can create own categories') THEN
      CREATE POLICY "Users can create own categories" ON public.money_categories FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_categories' AND policyname='Users can update own categories') THEN
      CREATE POLICY "Users can update own categories" ON public.money_categories FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_categories' AND policyname='Users can delete own categories') THEN
      CREATE POLICY "Users can delete own categories" ON public.money_categories FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;

-- money_transactions (conditional: only if user_id column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_transactions' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_transactions' AND policyname='Users can view own transactions') THEN
      CREATE POLICY "Users can view own transactions" ON public.money_transactions FOR SELECT USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_transactions' AND policyname='Users can create transactions for own accounts and categories') THEN
      CREATE POLICY "Users can create transactions for own accounts and categories"
        ON public.money_transactions FOR INSERT
        WITH CHECK (
          user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.money_accounts
            WHERE money_accounts.id = money_transactions.account_id
              AND money_accounts.user_id = auth.uid()
          )
          AND (
            category_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.money_categories
              WHERE money_categories.id = money_transactions.category_id
                AND money_categories.user_id = auth.uid()
            )
          )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_transactions' AND policyname='Users can update own transactions with own accounts and categories') THEN
      CREATE POLICY "Users can update own transactions with own accounts and categories"
        ON public.money_transactions FOR UPDATE
        USING (user_id = auth.uid())
        WITH CHECK (
          user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.money_accounts
            WHERE money_accounts.id = money_transactions.account_id
              AND money_accounts.user_id = auth.uid()
          )
          AND (
            category_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.money_categories
              WHERE money_categories.id = money_transactions.category_id
                AND money_categories.user_id = auth.uid()
            )
          )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_transactions' AND policyname='Users can delete own transactions') THEN
      CREATE POLICY "Users can delete own transactions" ON public.money_transactions FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;


-- ============================================================
-- 11. subscriptions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  amount            NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'MDL',
  billing_cycle     TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  next_billing_date DATE NOT NULL,
  category          TEXT NOT NULL DEFAULT 'other'
                      CHECK (category IN ('entertainment', 'productivity', 'cloud', 'education', 'health', 'other')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  url               TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS 'User subscription tracking for SubTracker module';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id          ON public.subscriptions (user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active_date ON public.subscriptions (user_id, is_active, next_billing_date);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_category    ON public.subscriptions (user_id, category);
  END IF;
END $$;


-- ============================================================
-- 12. Trigger + RLS — subscriptions
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.subscriptions'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- subscriptions (conditional: only if user_id column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can view own subscriptions') THEN
      CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can create own subscriptions') THEN
      CREATE POLICY "Users can create own subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can update own subscriptions') THEN
      CREATE POLICY "Users can update own subscriptions" ON public.subscriptions FOR UPDATE
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can delete own subscriptions') THEN
      CREATE POLICY "Users can delete own subscriptions" ON public.subscriptions FOR DELETE USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;
