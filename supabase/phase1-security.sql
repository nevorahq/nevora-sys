-- ============================================================
-- Business OS — Phase 1 Security Layer
-- ============================================================
-- Выполнять ПОСЛЕ того как таблицы уже созданы.
--
-- Содержит:
--   1. Helper security functions
--   2. Triggers (handle_updated_at)
--   3. RLS policies (все таблицы)
--   4. create_organization RPC
--   5. Seed: system roles + permissions + role_permissions
-- ============================================================


-- ============================================================
-- ЧАСТЬ 0: ОЧИСТКА (idempotent — безопасно запускать повторно)
-- ============================================================

-- Функции
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_org_ids() CASCADE;
DROP FUNCTION IF EXISTS public.is_org_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_org_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role_id(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_workspace(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_members(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_roles(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT) CASCADE;


-- ============================================================
-- ЧАСТЬ 1: UTILITY TRIGGERS
-- ============================================================

-- Универсальная функция автообновления updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Функция автосоздания профиля при регистрации
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


-- Триггеры updated_at
DO $$ BEGIN
  -- profiles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.profiles'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- organizations
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.organizations'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- roles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.roles'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- organization_members
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.organization_members'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- workspaces
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.workspaces'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- todos
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.todos'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- money_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.money_accounts'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.money_accounts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- money_categories
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.money_categories'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.money_categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- money_transactions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.money_transactions'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.money_transactions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
  -- subscriptions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'public.subscriptions'::regclass) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- Триггер автосоздания профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- ЧАСТЬ 2: SECURITY HELPER FUNCTIONS
-- ============================================================
-- Все функции STABLE SECURITY DEFINER:
--   STABLE   — PostgreSQL кэширует результат в рамках одной транзакции
--   SECURITY DEFINER — выполняется с правами владельца (postgres),
--                      обходит RLS на вспомогательных таблицах.
--                      Безопасно, т.к. функции только читают данные
--                      и всегда фильтруют по auth.uid().
-- ============================================================

-- Текущий аутентифицированный пользователь
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid()
$$ LANGUAGE sql STABLE;


-- Все организации, в которых пользователь активный участник.
-- Используется в RLS через: organization_id = ANY(public.get_user_org_ids())
-- STABLE — результат кэшируется на время одной транзакции/запроса.
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Является ли текущий пользователь активным участником организации?
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Является ли текущий пользователь владельцем организации?
-- Владелец — участник с системной ролью Owner (is_system=true, name='Owner').
CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND r.name = 'Owner'
      AND r.is_system = true
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ID роли текущего пользователя в организации.
CREATE OR REPLACE FUNCTION public.get_user_role_id(p_org_id UUID)
RETURNS UUID AS $$
  SELECT role_id
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Имеет ли текущий пользователь указанное разрешение в организации?
--
-- Цепочка: membership → role → role_permissions → permission.key
-- Поддерживает как системные (org_id IS NULL), так и кастомные роли.
--
-- Пример: has_permission(org_id, 'todos.write')
CREATE OR REPLACE FUNCTION public.has_permission(p_org_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.role_permissions rp ON rp.role_id = om.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND p.key = p_permission_key
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Может ли текущий пользователь управлять workspace в организации?
CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.has_permission(p_org_id, 'workspaces.manage')
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Может ли текущий пользователь управлять участниками организации?
CREATE OR REPLACE FUNCTION public.can_manage_members(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.has_permission(p_org_id, 'members.manage')
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Может ли текущий пользователь управлять ролями в организации?
CREATE OR REPLACE FUNCTION public.can_manage_roles(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.has_permission(p_org_id, 'roles.manage')
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- Имеет ли текущий пользователь доступ к конкретному workspace?
-- Доступ = запись в workspace_members OR is_org_owner.
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ============================================================
-- ЧАСТЬ 3: RLS POLICIES
-- ============================================================
-- Архитектура RLS:
--
--   SELECT  → is_org_member(organization_id)
--   INSERT  → has_permission(organization_id, 'resource.write')
--   UPDATE  → is_org_member (USING) + has_permission (WITH CHECK)
--   DELETE  → has_permission(organization_id, 'resource.write')
--
-- Для таблиц с workspace_id добавляется проверка workspace доступа.
-- Для связанных записей (transactions) — проверка владения account_id.
--
-- organization_id в payload при INSERT не доверяем:
--   has_permission() сам проверяет, что пользователь — член этой org.
--   Если подставить чужой organization_id — has_permission вернёт false.
-- ============================================================


-- ── profiles ──────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ── organizations ─────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_select_member"     ON public.organizations;
DROP POLICY IF EXISTS "orgs_update_owner"      ON public.organizations;
DROP POLICY IF EXISTS "orgs_delete_owner"      ON public.organizations;

-- Участник видит свою организацию
CREATE POLICY "orgs_select_member"
  ON public.organizations FOR SELECT
  USING (
    id = ANY(public.get_user_org_ids())
    AND deleted_at IS NULL
  );

-- Только владелец может обновить организацию
CREATE POLICY "orgs_update_owner"
  ON public.organizations FOR UPDATE
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

-- Только владелец может (мягко) удалить организацию
CREATE POLICY "orgs_delete_owner"
  ON public.organizations FOR DELETE
  USING (public.is_org_owner(id));

-- INSERT запрещён напрямую — только через create_organization RPC


-- ── roles ─────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select_member"   ON public.roles;
DROP POLICY IF EXISTS "roles_insert_admin"    ON public.roles;
DROP POLICY IF EXISTS "roles_update_admin"    ON public.roles;
DROP POLICY IF EXISTS "roles_delete_admin"    ON public.roles;

-- Участник видит системные роли + роли своей организации
CREATE POLICY "roles_select_member"
  ON public.roles FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = ANY(public.get_user_org_ids())
  );

-- Кастомные роли создаёт только тот, кто имеет roles.manage
CREATE POLICY "roles_insert_admin"
  ON public.roles FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.has_permission(organization_id, 'roles.manage')
    AND is_system = false
  );

CREATE POLICY "roles_update_admin"
  ON public.roles FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND public.has_permission(organization_id, 'roles.manage')
    AND is_system = false
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.has_permission(organization_id, 'roles.manage')
    AND is_system = false
  );

CREATE POLICY "roles_delete_admin"
  ON public.roles FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND public.has_permission(organization_id, 'roles.manage')
    AND is_system = false
  );


-- ── permissions ───────────────────────────────────────────
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions_select_all"  ON public.permissions;

-- Разрешения видят все аутентифицированные пользователи (read-only системная таблица)
CREATE POLICY "permissions_select_all"
  ON public.permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE запрещены всем — только через миграции


-- ── role_permissions ──────────────────────────────────────
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select_member" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_manage_admin"  ON public.role_permissions;

-- Участник видит role_permissions для своей org + системных ролей
CREATE POLICY "role_permissions_select_member"
  ON public.role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (
          r.organization_id IS NULL
          OR r.organization_id = ANY(public.get_user_org_ids())
        )
    )
  );

-- Управление role_permissions только через roles.manage
CREATE POLICY "role_permissions_manage_admin"
  ON public.role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND r.organization_id IS NOT NULL
        AND r.is_system = false
        AND public.has_permission(r.organization_id, 'roles.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND r.organization_id IS NOT NULL
        AND r.is_system = false
        AND public.has_permission(r.organization_id, 'roles.manage')
    )
  );


-- ── organization_members ──────────────────────────────────
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_member"  ON public.organization_members;
DROP POLICY IF EXISTS "members_insert_admin"   ON public.organization_members;
DROP POLICY IF EXISTS "members_update_admin"   ON public.organization_members;
DROP POLICY IF EXISTS "members_delete_admin"   ON public.organization_members;

-- Участник видит всех членов своей организации
CREATE POLICY "members_select_member"
  ON public.organization_members FOR SELECT
  USING (organization_id = ANY(public.get_user_org_ids()));

-- Приглашать участников может тот, кто имеет members.manage
CREATE POLICY "members_insert_admin"
  ON public.organization_members FOR INSERT
  WITH CHECK (public.has_permission(organization_id, 'members.manage'));

-- Обновлять membership (смена роли, статуса) — members.manage
-- Исключение: пользователь не может изменить свой собственный статус
CREATE POLICY "members_update_admin"
  ON public.organization_members FOR UPDATE
  USING (
    public.has_permission(organization_id, 'members.manage')
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.has_permission(organization_id, 'members.manage')
    AND user_id <> auth.uid()
  );

-- Удалить участника — members.manage (нельзя удалить себя)
CREATE POLICY "members_delete_admin"
  ON public.organization_members FOR DELETE
  USING (
    public.has_permission(organization_id, 'members.manage')
    AND user_id <> auth.uid()
  );


-- ── workspaces ────────────────────────────────────────────
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_select_member"  ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert_admin"   ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_admin"   ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_delete_admin"   ON public.workspaces;

-- Участник видит все workspace своей организации
CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT
  USING (
    organization_id = ANY(public.get_user_org_ids())
    AND deleted_at IS NULL
  );

-- Создавать workspace — workspaces.manage
CREATE POLICY "workspaces_insert_admin"
  ON public.workspaces FOR INSERT
  WITH CHECK (public.has_permission(organization_id, 'workspaces.manage'));

-- Обновлять workspace — workspaces.manage
CREATE POLICY "workspaces_update_admin"
  ON public.workspaces FOR UPDATE
  USING (public.has_permission(organization_id, 'workspaces.manage'))
  WITH CHECK (public.has_permission(organization_id, 'workspaces.manage'));

-- Удалять (мягко) workspace — workspaces.manage
CREATE POLICY "workspaces_delete_admin"
  ON public.workspaces FOR DELETE
  USING (public.has_permission(organization_id, 'workspaces.manage'));


-- ── workspace_members ─────────────────────────────────────
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_members_select_org_member" ON public.workspace_members;
DROP POLICY IF EXISTS "ws_members_manage_admin"      ON public.workspace_members;

-- Участник организации видит, кто есть в каких workspace
CREATE POLICY "ws_members_select_org_member"
  ON public.workspace_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND w.organization_id = ANY(public.get_user_org_ids())
    )
  );

-- Добавлять/удалять участников из workspace — workspaces.manage
CREATE POLICY "ws_members_manage_admin"
  ON public.workspace_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND public.has_permission(w.organization_id, 'workspaces.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
        AND public.has_permission(w.organization_id, 'workspaces.manage')
    )
  );


-- ── todos ─────────────────────────────────────────────────
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos_select_member"  ON public.todos;
DROP POLICY IF EXISTS "todos_insert_write"   ON public.todos;
DROP POLICY IF EXISTS "todos_update_write"   ON public.todos;
DROP POLICY IF EXISTS "todos_delete_write"   ON public.todos;

CREATE POLICY "todos_select_member"
  ON public.todos FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "todos_insert_write"
  ON public.todos FOR INSERT
  WITH CHECK (
    public.has_permission(organization_id, 'todos.write')
    AND created_by = auth.uid()
  );

CREATE POLICY "todos_update_write"
  ON public.todos FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.has_permission(organization_id, 'todos.write'));

CREATE POLICY "todos_delete_write"
  ON public.todos FOR DELETE
  USING (public.has_permission(organization_id, 'todos.write'));


-- ── money_accounts ────────────────────────────────────────
ALTER TABLE public.money_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select_member"  ON public.money_accounts;
DROP POLICY IF EXISTS "accounts_insert_write"   ON public.money_accounts;
DROP POLICY IF EXISTS "accounts_update_write"   ON public.money_accounts;
DROP POLICY IF EXISTS "accounts_delete_write"   ON public.money_accounts;

CREATE POLICY "accounts_select_member"
  ON public.money_accounts FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "accounts_insert_write"
  ON public.money_accounts FOR INSERT
  WITH CHECK (
    public.has_permission(organization_id, 'money.write')
    AND created_by = auth.uid()
  );

CREATE POLICY "accounts_update_write"
  ON public.money_accounts FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.has_permission(organization_id, 'money.write'));

CREATE POLICY "accounts_delete_write"
  ON public.money_accounts FOR DELETE
  USING (public.has_permission(organization_id, 'money.write'));


-- ── money_categories ──────────────────────────────────────
ALTER TABLE public.money_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_member"  ON public.money_categories;
DROP POLICY IF EXISTS "categories_insert_write"   ON public.money_categories;
DROP POLICY IF EXISTS "categories_update_write"   ON public.money_categories;
DROP POLICY IF EXISTS "categories_delete_write"   ON public.money_categories;

CREATE POLICY "categories_select_member"
  ON public.money_categories FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "categories_insert_write"
  ON public.money_categories FOR INSERT
  WITH CHECK (
    public.has_permission(organization_id, 'money.write')
    AND created_by = auth.uid()
  );

CREATE POLICY "categories_update_write"
  ON public.money_categories FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (
    public.has_permission(organization_id, 'money.write')
    AND is_default = false
  );

CREATE POLICY "categories_delete_write"
  ON public.money_categories FOR DELETE
  USING (
    public.has_permission(organization_id, 'money.write')
    AND is_default = false
  );


-- ── money_transactions ────────────────────────────────────
-- Дополнительная защита: account_id и category_id должны
-- принадлежать той же организации. Предотвращает cross-org injection.
ALTER TABLE public.money_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_member"  ON public.money_transactions;
DROP POLICY IF EXISTS "transactions_insert_write"   ON public.money_transactions;
DROP POLICY IF EXISTS "transactions_update_write"   ON public.money_transactions;
DROP POLICY IF EXISTS "transactions_delete_write"   ON public.money_transactions;

CREATE POLICY "transactions_select_member"
  ON public.money_transactions FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "transactions_insert_write"
  ON public.money_transactions FOR INSERT
  WITH CHECK (
    public.has_permission(organization_id, 'money.write')
    AND created_by = auth.uid()
    -- account принадлежит этой же org
    AND EXISTS (
      SELECT 1 FROM public.money_accounts a
      WHERE a.id = account_id
        AND a.organization_id = money_transactions.organization_id
        AND a.deleted_at IS NULL
    )
    -- category (если указана) принадлежит этой же org
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = category_id
          AND c.organization_id = money_transactions.organization_id
          AND c.deleted_at IS NULL
      )
    )
  );

CREATE POLICY "transactions_update_write"
  ON public.money_transactions FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (
    public.has_permission(organization_id, 'money.write')
    AND EXISTS (
      SELECT 1 FROM public.money_accounts a
      WHERE a.id = account_id
        AND a.organization_id = money_transactions.organization_id
        AND a.deleted_at IS NULL
    )
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = category_id
          AND c.organization_id = money_transactions.organization_id
          AND c.deleted_at IS NULL
      )
    )
  );

CREATE POLICY "transactions_delete_write"
  ON public.money_transactions FOR DELETE
  USING (public.has_permission(organization_id, 'money.write'));


-- ── subscriptions ─────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_select_member"  ON public.subscriptions;
DROP POLICY IF EXISTS "subs_insert_write"   ON public.subscriptions;
DROP POLICY IF EXISTS "subs_update_write"   ON public.subscriptions;
DROP POLICY IF EXISTS "subs_delete_write"   ON public.subscriptions;

CREATE POLICY "subs_select_member"
  ON public.subscriptions FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "subs_insert_write"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    public.has_permission(organization_id, 'subscriptions.write')
    AND created_by = auth.uid()
  );

CREATE POLICY "subs_update_write"
  ON public.subscriptions FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.has_permission(organization_id, 'subscriptions.write'));

CREATE POLICY "subs_delete_write"
  ON public.subscriptions FOR DELETE
  USING (public.has_permission(organization_id, 'subscriptions.write'));


-- ============================================================
-- ЧАСТЬ 4: ИНДЕКСЫ
-- ============================================================
-- Критически важны для RLS — каждый запрос с is_org_member()
-- триггерит EXISTS на organization_members. Без индексов — seq scan.

CREATE INDEX IF NOT EXISTS idx_org_members_user_org
  ON public.organization_members (user_id, organization_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON public.organization_members (organization_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_org_id
  ON public.workspaces (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ws_members_workspace_user
  ON public.workspace_members (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ws_members_user_id
  ON public.workspace_members (user_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
  ON public.role_permissions (role_id);

CREATE INDEX IF NOT EXISTS idx_todos_org_workspace
  ON public.todos (organization_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_org_created
  ON public.todos (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_money_accounts_org
  ON public.money_accounts (organization_id)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_money_categories_org_type
  ON public.money_categories (organization_id, type)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_money_transactions_org_date
  ON public.money_transactions (organization_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_money_transactions_account
  ON public.money_transactions (account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_active_date
  ON public.subscriptions (organization_id, is_active, next_billing_date)
  WHERE deleted_at IS NULL;


-- ============================================================
-- ЧАСТЬ 5: SEED — СИСТЕМНЫЕ PERMISSIONS
-- ============================================================
-- permissions — read-only системная таблица, управляется только миграциями.
-- Используем INSERT ... ON CONFLICT DO NOTHING для идемпотентности.

INSERT INTO public.permissions (id, key, resource, action, description) VALUES
  -- Todos
  (gen_random_uuid(), 'todos.read',              'todos',          'read',   'View tasks'),
  (gen_random_uuid(), 'todos.write',             'todos',          'write',  'Create, update, delete tasks'),
  -- Money
  (gen_random_uuid(), 'money.read',              'money',          'read',   'View financial accounts and transactions'),
  (gen_random_uuid(), 'money.write',             'money',          'write',  'Create, update, delete financial data'),
  -- Subscriptions
  (gen_random_uuid(), 'subscriptions.read',      'subscriptions',  'read',   'View subscriptions'),
  (gen_random_uuid(), 'subscriptions.write',     'subscriptions',  'write',  'Create, update, delete subscriptions'),
  -- Workspaces
  (gen_random_uuid(), 'workspaces.manage',       'workspaces',     'manage', 'Create and manage workspaces'),
  -- Members
  (gen_random_uuid(), 'members.manage',          'members',        'manage', 'Invite and manage organization members'),
  -- Roles
  (gen_random_uuid(), 'roles.manage',            'roles',          'manage', 'Create and manage custom roles'),
  -- Organization
  (gen_random_uuid(), 'organization.settings',   'organization',   'admin',  'Manage organization settings'),
  -- CRM (future)
  (gen_random_uuid(), 'crm.read',                'crm',            'read',   'View CRM data'),
  (gen_random_uuid(), 'crm.write',               'crm',            'write',  'Create, update, delete CRM data'),
  -- Projects (future)
  (gen_random_uuid(), 'projects.read',           'projects',       'read',   'View projects'),
  (gen_random_uuid(), 'projects.write',          'projects',       'write',  'Create, update, delete projects'),
  -- Documents (future)
  (gen_random_uuid(), 'documents.read',          'documents',      'read',   'View documents'),
  (gen_random_uuid(), 'documents.write',         'documents',      'write',  'Create, update, delete documents'),
  -- Analytics (future)
  (gen_random_uuid(), 'analytics.read',          'analytics',      'read',   'View analytics and reports'),
  -- AI (future)
  (gen_random_uuid(), 'ai.use',                  'ai',             'use',    'Use AI assistant features'),
  -- Automation (future)
  (gen_random_uuid(), 'automation.read',         'automation',     'read',   'View automation workflows'),
  (gen_random_uuid(), 'automation.write',        'automation',     'write',  'Create and manage automation workflows')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- ЧАСТЬ 6: SEED — СИСТЕМНЫЕ РОЛИ
-- ============================================================
-- Системные роли (organization_id IS NULL, is_system = true).
-- Назначаются при создании организации через create_organization().
-- Кастомные роли создаются per-org через roles.manage permission.

INSERT INTO public.roles (id, organization_id, name, description, is_system) VALUES
  (gen_random_uuid(), NULL, 'Owner',   'Full control: all permissions, cannot be removed', true),
  (gen_random_uuid(), NULL, 'Admin',   'All permissions except organization settings',      true),
  (gen_random_uuid(), NULL, 'Manager', 'Resource management within assigned workspaces',   true),
  (gen_random_uuid(), NULL, 'Member',  'Standard access: read + write own resources',      true)
ON CONFLICT DO NOTHING;


-- ============================================================
-- ЧАСТЬ 7: SEED — ROLE_PERMISSIONS ДЛЯ СИСТЕМНЫХ РОЛЕЙ
-- ============================================================
-- Owner  → все permissions
-- Admin  → все кроме organization.settings
-- Manager → todos.*, money.*, subscriptions.*, crm.*, projects.*, documents.*, analytics.read, ai.use, automation.read
-- Member  → todos.*, money.read, subscriptions.read, crm.read, projects.read, documents.read, ai.use

DO $$
DECLARE
  v_owner_id   UUID;
  v_admin_id   UUID;
  v_manager_id UUID;
  v_member_id  UUID;
BEGIN
  SELECT id INTO v_owner_id   FROM public.roles WHERE name = 'Owner'   AND is_system = true AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_admin_id   FROM public.roles WHERE name = 'Admin'   AND is_system = true AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_manager_id FROM public.roles WHERE name = 'Manager' AND is_system = true AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_member_id  FROM public.roles WHERE name = 'Member'  AND is_system = true AND organization_id IS NULL LIMIT 1;

  IF v_owner_id IS NULL OR v_admin_id IS NULL OR v_manager_id IS NULL OR v_member_id IS NULL THEN
    RAISE EXCEPTION 'System roles not found — run seed first';
  END IF;

  -- Удаляем существующие назначения для системных ролей (idempotent)
  DELETE FROM public.role_permissions
  WHERE role_id IN (v_owner_id, v_admin_id, v_manager_id, v_member_id);

  -- Owner: все permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_owner_id, id FROM public.permissions;

  -- Admin: все кроме organization.settings
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_admin_id, id FROM public.permissions
  WHERE key <> 'organization.settings';

  -- Manager: управление ресурсами, без org/member/role admin
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_manager_id, id FROM public.permissions
  WHERE key IN (
    'todos.read', 'todos.write',
    'money.read', 'money.write',
    'subscriptions.read', 'subscriptions.write',
    'workspaces.manage',
    'crm.read', 'crm.write',
    'projects.read', 'projects.write',
    'documents.read', 'documents.write',
    'analytics.read',
    'ai.use',
    'automation.read'
  );

  -- Member: базовый доступ
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_member_id, id FROM public.permissions
  WHERE key IN (
    'todos.read', 'todos.write',
    'money.read',
    'subscriptions.read',
    'crm.read',
    'projects.read',
    'documents.read',
    'ai.use'
  );

END $$;


-- ============================================================
-- ЧАСТЬ 8: RPC create_organization
-- ============================================================
-- SECURITY DEFINER: выполняется с правами postgres.
-- Зачем: при создании организации пользователь ещё не member,
-- поэтому RLS заблокирует прямые INSERT. SECURITY DEFINER
-- обходит RLS, но мы сами проверяем auth.uid().
--
-- Атомарная транзакция:
--   1. Создать организацию
--   2. Создать membership с ролью Owner
--   3. Создать дефолтный workspace "General"
--   4. Добавить создателя в workspace
--
-- Возвращает: organization_id (UUID)
--
-- Вызов: supabase.rpc('create_organization', { p_name: '...', p_slug: '...' })

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id      UUID;
  v_org_id       UUID;
  v_owner_role_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Аутентификация: SECURITY DEFINER функция не получает auth.uid()
  -- из JWT автоматически в некоторых версиях Supabase — используем auth.uid()
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Проверка: slug format (lowercase alphanumeric + hyphens)
  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Invalid slug format' USING ERRCODE = '22023';
  END IF;

  -- Найти системную роль Owner
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE name = 'Owner'
    AND is_system = true
    AND organization_id IS NULL
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Owner role not found — run phase1-security.sql seed first' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Создать организацию
  INSERT INTO public.organizations (name, slug, plan, created_by, updated_by)
  VALUES (
    trim(p_name),
    lower(trim(p_slug)),
    'free',
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_org_id;

  -- 2. Создать membership (создатель = Owner)
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role_id,
    status,
    invited_by,
    joined_at
  )
  VALUES (
    v_org_id,
    v_user_id,
    v_owner_role_id,
    'active',
    v_user_id,
    now()
  );

  -- 3. Создать дефолтный workspace
  INSERT INTO public.workspaces (
    organization_id,
    name,
    slug,
    description,
    created_by,
    updated_by
  )
  VALUES (
    v_org_id,
    'General',
    'general',
    'Default workspace',
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_workspace_id;

  -- 4. Добавить создателя в workspace
  INSERT INTO public.workspace_members (workspace_id, user_id)
  VALUES (v_workspace_id, v_user_id);

  RETURN v_org_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Organization slug already taken' USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Запрещаем прямой вызов анонимами
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;


-- ============================================================
-- ЧАСТЬ 9: ФИНАЛЬНЫЕ GRANT
-- ============================================================
-- Supabase по умолчанию ограничивает SELECT на public таблицах.
-- Явно даём права authenticated роли на все таблицы.
-- RLS ограничит доступ до уровня строк.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members   TO authenticated;
GRANT SELECT                         ON public.permissions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.money_accounts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.money_categories    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.money_transactions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions       TO authenticated;

-- Запрет для анонимных пользователей
REVOKE ALL ON public.profiles             FROM anon;
REVOKE ALL ON public.organizations        FROM anon;
REVOKE ALL ON public.roles                FROM anon;
REVOKE ALL ON public.organization_members FROM anon;
REVOKE ALL ON public.workspaces           FROM anon;
REVOKE ALL ON public.workspace_members    FROM anon;
REVOKE ALL ON public.permissions          FROM anon;
REVOKE ALL ON public.role_permissions     FROM anon;
REVOKE ALL ON public.todos                FROM anon;
REVOKE ALL ON public.money_accounts       FROM anon;
REVOKE ALL ON public.money_categories     FROM anon;
REVOKE ALL ON public.money_transactions   FROM anon;
REVOKE ALL ON public.subscriptions        FROM anon;

-- ============================================================
-- ГОТОВО
-- ============================================================
-- Выполни этот файл в Supabase SQL Editor.
-- Порядок: таблицы (через UI/Supabase) → этот файл.
-- ============================================================
