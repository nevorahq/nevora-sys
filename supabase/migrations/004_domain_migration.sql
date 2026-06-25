-- ============================================================
-- Phase 2 — Migration 004: Domain Tables Migration Strategy
-- ============================================================
-- Мигрируем: todos, money_accounts, money_categories,
--            money_transactions, subscriptions
-- от user_id-owned → organization_id-owned
--
-- СТРАТЕГИЯ НУЛЕВЫХ ПОТЕРЬ ДАННЫХ:
-- 1. Добавляем organization_id (nullable) рядом с user_id
-- 2. Backfill: для каждого user_id находим его org и заполняем
-- 3. Делаем organization_id NOT NULL
-- 4. Перестраиваем RLS: organization_id заменяет user_id
-- 5. user_id остаётся как audit field (кто создал запись)
--
-- НЕ УДАЛЯЕМ user_id — он нужен для аудита ("Иван создал эту задачу").
-- Просто убираем из RLS как access control поле.
-- ============================================================


-- ============================================================
-- STEP 1: Создание "личных" org для каждого существующего user
-- ============================================================
-- Каждый текущий user получает персональную org автоматически.
-- Это позволяет не терять данные и не ломать текущий single-user flow.
-- В будущем пользователь может создать корпоративную org и перенести данные.

-- Вставляем org для каждого user, у которого её ещё нет
INSERT INTO public.organizations (id, name, slug, plan)
SELECT
  gen_random_uuid(),
  COALESCE(p.display_name, 'Personal Workspace'),
  'personal-' || replace(u.id::text, '-', ''),
  'free'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.user_id = u.id AND m.status = 'active'
);

-- Создаём membership owner для каждого user → его org
INSERT INTO public.memberships (user_id, organization_id, role, status)
SELECT
  u.id,
  o.id,
  'owner',
  'active'
FROM auth.users u
JOIN public.organizations o ON o.slug = 'personal-' || replace(u.id::text, '-', '')
WHERE NOT EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.user_id = u.id AND m.status = 'active'
);

-- Создаём default workspace для каждой личной org
INSERT INTO public.workspaces (organization_id, name, type, is_default)
SELECT
  m.organization_id,
  'Default',
  'default',
  true
FROM public.memberships m
WHERE m.role = 'owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.organization_id = m.organization_id
  );


-- ============================================================
-- STEP 2: Добавляем organization_id в domain tables (nullable)
-- ============================================================
-- Nullable на этом шаге — не ломаем INSERT пока не backfill.

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Колонки multi-tenant модели todos. Раньше их добавляли вручную в живой БД
-- (Supabase SQL editor), но в migrations/ они не попали → `db reset` собирал
-- todos без них, а 007/код от них зависят. Verified present in live DB.
-- Nullable + FK по конвенции 008_crm_module.sql. user_id снимается в 031.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.todos.workspace_id IS 'Workspace scope (nullable); set by create-task.action.ts.';
COMMENT ON COLUMN public.todos.created_by   IS 'auth.users.id of the creator; SET NULL on user delete.';
COMMENT ON COLUMN public.todos.updated_by   IS 'auth.users.id of the last editor; SET NULL on user delete.';
COMMENT ON COLUMN public.todos.deleted_at   IS 'Soft-delete timestamp; queries filter WHERE deleted_at IS NULL.';

ALTER TABLE public.money_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.money_categories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Soft-delete на money-таблицах: тот же дрифт, что и у todos. Колонка есть в
-- живой БД, но в migrations/ не попала; 014_money_summary_rpc фильтрует
-- WHERE deleted_at IS NULL по money_accounts/money_transactions и без неё падает.
ALTER TABLE public.money_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.money_accounts.deleted_at     IS 'Soft-delete timestamp; get_org_money_summary filters WHERE deleted_at IS NULL.';
COMMENT ON COLUMN public.money_transactions.deleted_at IS 'Soft-delete timestamp; get_org_money_summary filters WHERE deleted_at IS NULL.';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ============================================================
-- STEP 3: Backfill organization_id из user_id → membership
-- ============================================================
-- Для каждой записи: находим org по user_id через memberships.
-- owner membership = персональная org пользователя.
-- Условно: только если user_id ещё существует (не уже мигрировано).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'todos' AND column_name = 'user_id'
  ) THEN
    UPDATE public.todos t
    SET organization_id = m.organization_id
    FROM public.memberships m
    WHERE m.user_id = t.user_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND t.organization_id IS NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_accounts' AND column_name = 'user_id'
  ) THEN
    UPDATE public.money_accounts ma
    SET organization_id = m.organization_id
    FROM public.memberships m
    WHERE m.user_id = ma.user_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND ma.organization_id IS NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_categories' AND column_name = 'user_id'
  ) THEN
    UPDATE public.money_categories mc
    SET organization_id = m.organization_id
    FROM public.memberships m
    WHERE m.user_id = mc.user_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND mc.organization_id IS NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_transactions' AND column_name = 'user_id'
  ) THEN
    UPDATE public.money_transactions mt
    SET organization_id = m.organization_id
    FROM public.memberships m
    WHERE m.user_id = mt.user_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND mt.organization_id IS NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id'
  ) THEN
    UPDATE public.subscriptions s
    SET organization_id = m.organization_id
    FROM public.memberships m
    WHERE m.user_id = s.user_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND s.organization_id IS NULL;
  END IF;
END $$;


-- ============================================================
-- STEP 4: Делаем organization_id NOT NULL (после backfill)
-- ============================================================
-- Перед этим шагом убедись что backfill прошёл успешно:
-- SELECT count(*) FROM todos WHERE organization_id IS NULL; -- должно быть 0

ALTER TABLE public.todos
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.money_accounts
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.money_categories
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.money_transactions
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN organization_id SET NOT NULL;


-- ============================================================
-- STEP 5: Индексы для организационного поиска
-- ============================================================
CREATE INDEX IF NOT EXISTS todos_org_id_idx ON public.todos(organization_id);
CREATE INDEX IF NOT EXISTS money_accounts_org_id_idx ON public.money_accounts(organization_id);
CREATE INDEX IF NOT EXISTS money_categories_org_id_idx ON public.money_categories(organization_id);
CREATE INDEX IF NOT EXISTS money_transactions_org_id_idx ON public.money_transactions(organization_id);
CREATE INDEX IF NOT EXISTS subscriptions_org_id_idx ON public.subscriptions(organization_id);


-- ============================================================
-- STEP 6: Перестраиваем RLS на domain tables
-- ============================================================
-- Полностью заменяем старые user_id-based политики.
-- user_id ОСТАЁТСЯ в таблице как audit field, но НЕ используется в RLS.

-- ---- TODOS ----
DROP POLICY IF EXISTS "todos_select_own" ON public.todos;
DROP POLICY IF EXISTS "todos_insert_own" ON public.todos;
DROP POLICY IF EXISTS "todos_update_own" ON public.todos;
DROP POLICY IF EXISTS "todos_delete_own" ON public.todos;
-- Старые имена (если были другие):
DROP POLICY IF EXISTS "select_own_todos" ON public.todos;
DROP POLICY IF EXISTS "insert_own_todos" ON public.todos;
DROP POLICY IF EXISTS "update_own_todos" ON public.todos;
DROP POLICY IF EXISTS "delete_own_todos" ON public.todos;

DROP POLICY IF EXISTS "todos_org_select" ON public.todos;
CREATE POLICY "todos_org_select"
  ON public.todos FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "todos_org_insert" ON public.todos;
CREATE POLICY "todos_org_insert"
  ON public.todos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "todos_org_update" ON public.todos;
CREATE POLICY "todos_org_update"
  ON public.todos FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "todos_org_delete" ON public.todos;
CREATE POLICY "todos_org_delete"
  ON public.todos FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ---- MONEY_ACCOUNTS ----
DROP POLICY IF EXISTS "money_accounts_select_own" ON public.money_accounts;
DROP POLICY IF EXISTS "money_accounts_insert_own" ON public.money_accounts;
DROP POLICY IF EXISTS "money_accounts_update_own" ON public.money_accounts;
DROP POLICY IF EXISTS "money_accounts_delete_own" ON public.money_accounts;

DROP POLICY IF EXISTS "money_accounts_org_select" ON public.money_accounts;
CREATE POLICY "money_accounts_org_select"
  ON public.money_accounts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "money_accounts_org_insert" ON public.money_accounts;
CREATE POLICY "money_accounts_org_insert"
  ON public.money_accounts FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_accounts_org_update" ON public.money_accounts;
CREATE POLICY "money_accounts_org_update"
  ON public.money_accounts FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_accounts_org_delete" ON public.money_accounts;
CREATE POLICY "money_accounts_org_delete"
  ON public.money_accounts FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ---- MONEY_CATEGORIES ----
DROP POLICY IF EXISTS "money_categories_select_own" ON public.money_categories;
DROP POLICY IF EXISTS "money_categories_insert_own" ON public.money_categories;
DROP POLICY IF EXISTS "money_categories_update_own" ON public.money_categories;
DROP POLICY IF EXISTS "money_categories_delete_own" ON public.money_categories;

DROP POLICY IF EXISTS "money_categories_org_select" ON public.money_categories;
CREATE POLICY "money_categories_org_select"
  ON public.money_categories FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "money_categories_org_insert" ON public.money_categories;
CREATE POLICY "money_categories_org_insert"
  ON public.money_categories FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_categories_org_update" ON public.money_categories;
CREATE POLICY "money_categories_org_update"
  ON public.money_categories FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_categories_org_delete" ON public.money_categories;
CREATE POLICY "money_categories_org_delete"
  ON public.money_categories FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ---- MONEY_TRANSACTIONS ----
DROP POLICY IF EXISTS "money_transactions_select_own" ON public.money_transactions;
DROP POLICY IF EXISTS "money_transactions_insert_own" ON public.money_transactions;
DROP POLICY IF EXISTS "money_transactions_update_own" ON public.money_transactions;
DROP POLICY IF EXISTS "money_transactions_delete_own" ON public.money_transactions;

DROP POLICY IF EXISTS "money_transactions_org_select" ON public.money_transactions;
CREATE POLICY "money_transactions_org_select"
  ON public.money_transactions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "money_transactions_org_insert" ON public.money_transactions;
CREATE POLICY "money_transactions_org_insert"
  ON public.money_transactions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_transactions_org_update" ON public.money_transactions;
CREATE POLICY "money_transactions_org_update"
  ON public.money_transactions FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "money_transactions_org_delete" ON public.money_transactions;
CREATE POLICY "money_transactions_org_delete"
  ON public.money_transactions FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ---- SUBSCRIPTIONS ----
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_delete_own" ON public.subscriptions;

DROP POLICY IF EXISTS "subscriptions_org_select" ON public.subscriptions;
CREATE POLICY "subscriptions_org_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "subscriptions_org_insert" ON public.subscriptions;
CREATE POLICY "subscriptions_org_insert"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "subscriptions_org_update" ON public.subscriptions;
CREATE POLICY "subscriptions_org_update"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "subscriptions_org_delete" ON public.subscriptions;
CREATE POLICY "subscriptions_org_delete"
  ON public.subscriptions FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- VERIFICATION QUERIES (запусти после миграции)
-- ============================================================
-- SELECT count(*) FROM todos WHERE organization_id IS NULL;            -- 0
-- SELECT count(*) FROM money_accounts WHERE organization_id IS NULL;   -- 0
-- SELECT count(*) FROM money_transactions WHERE organization_id IS NULL; -- 0
-- SELECT count(*) FROM subscriptions WHERE organization_id IS NULL;    -- 0
-- SELECT count(*) FROM memberships WHERE status = 'active';            -- = кол-во users
-- SELECT count(*) FROM organizations;                                  -- = кол-во users
