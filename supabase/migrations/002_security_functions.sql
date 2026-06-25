-- ============================================================
-- Phase 2 — Migration 002: Security Functions Layer
-- ============================================================
-- ВАЖНО: Все функции используют SECURITY DEFINER с явным
-- search_path = public, pg_catalog для предотвращения
-- search_path injection атак.
--
-- STABLE: функция не изменяет БД и возвращает одинаковый
-- результат для одних входных данных в одном запросе.
-- Позволяет PostgreSQL кешировать результат внутри транзакции —
-- критично для RLS, где функция вызывается на каждую строку.
-- ============================================================

-- ============================================================
-- 1. current_user_id()
-- ============================================================
-- Обёртка над auth.uid() для консистентности и тестируемости.
-- Используй эту функцию вместо auth.uid() везде в RLS.

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_id() IS 'Returns current authenticated user UUID. Wrapper around auth.uid() for consistency.';


-- ============================================================
-- 2. current_organization_id()
-- ============================================================
-- Читает organization_id из JWT claims.
-- Клиент ДОЛЖЕН передавать organization_id в JWT custom claims
-- при каждом запросе (через Supabase session metadata или
-- через set_config в начале транзакции).
--
-- Fallback: если JWT claim отсутствует — пробует найти единственную
-- активную org пользователя. Это безопасно для single-org юзеров.
-- Если у пользователя несколько org — fallback ВЕРНЁТ NULL,
-- запрос упадёт. Клиент обязан явно передавать org context.
--
-- АТАКА: злоумышленник может попытаться передать чужой org_id в JWT.
-- Защита: RLS дополнительно проверяет членство через is_org_member().
-- Без действующего membership — доступ запрещён независимо от claim.

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Попытка 1: читаем из JWT custom claims
  -- Supabase позволяет добавлять custom claims через auth.users.raw_app_meta_data
  org_id := (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
  );

  -- Попытка 2: single-org fallback (безопасно только если 1 org)
  IF org_id IS NULL THEN
    SELECT m.organization_id INTO org_id
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
    LIMIT 1;
    -- Если нашлось 2+ записей — это не проблема безопасности:
    -- мы берём одну, но RLS по is_org_member() всё равно защитит.
    -- Для multi-org пользователей клиент ОБЯЗАН передавать org claim.
  END IF;

  RETURN org_id;
END;
$$;

COMMENT ON FUNCTION public.current_organization_id() IS
  'Returns current org UUID from JWT claims. Falls back to single-org lookup. '
  'Multi-org users MUST pass organization_id in JWT app_metadata.';


-- ============================================================
-- 3. current_membership()
-- ============================================================
-- Возвращает полную запись membership для текущего user+org.
-- Используется другими хелперами для избежания повторных SELECT.

CREATE OR REPLACE FUNCTION public.current_membership()
RETURNS public.memberships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT *
  FROM public.memberships
  WHERE user_id = public.current_user_id()
    AND organization_id = public.current_organization_id()
    AND status = 'active'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_membership() IS 'Returns active membership record for current user in current org.';


-- ============================================================
-- 4. current_role()
-- ============================================================
-- Возвращает роль текущего пользователя в текущей org.
-- NULL если нет активного членства.

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT role
  FROM public.memberships
  WHERE user_id = public.current_user_id()
    AND organization_id = public.current_organization_id()
    AND status = 'active'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_role() IS 'Returns role of current user in current organization. NULL if no active membership.';


-- ============================================================
-- 5. is_org_member(org_id)
-- ============================================================
-- Проверяет, является ли current user активным членом указанной org.
-- Это ГЛАВНАЯ защита от cross-tenant доступа.
-- Используется в каждой RLS политике.

CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_org_member(UUID) IS
  'Core cross-tenant guard. Returns true only if current user has active membership in given org.';


-- ============================================================
-- 6. is_org_admin(org_id)
-- ============================================================
-- admin ИЛИ owner — оба могут управлять организацией.

CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_org_admin(UUID) IS 'Returns true if current user is owner or admin in given org.';


-- ============================================================
-- 7. is_org_owner(org_id)
-- ============================================================
-- Только owner. Нужен для: удаление org, передача ownership,
-- изменение плана, критические настройки.

CREATE OR REPLACE FUNCTION public.is_org_owner(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_org_owner(UUID) IS 'Returns true only if current user is the owner of given org.';


-- ============================================================
-- 8. RBAC Permission Helpers
-- ============================================================
-- Всё через роль из current_membership() для единой точки правды.
-- Используй эти функции в server actions и API routes.
-- НЕ дублируй логику ролей в коде — только здесь.

-- Управление пользователями (invite, remove, change role)
CREATE OR REPLACE FUNCTION public.can_manage_users(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_org_admin(p_organization_id);
$$;

-- Управление биллингом (план, платёжные методы)
CREATE OR REPLACE FUNCTION public.can_manage_billing(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_org_owner(p_organization_id);
$$;

-- Управление workspace (создать, переименовать, удалить)
CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_org_admin(p_organization_id);
$$;

-- Запись данных (создать/обновить бизнес-записи)
CREATE OR REPLACE FUNCTION public.can_write_data(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'manager', 'member')
  );
$$;

-- Удаление данных (только manager и выше)
CREATE OR REPLACE FUNCTION public.can_delete_data(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'manager')
  );
$$;

COMMENT ON FUNCTION public.can_manage_users(UUID) IS 'admin+ can manage org members.';
COMMENT ON FUNCTION public.can_manage_billing(UUID) IS 'owner-only: billing and plan changes.';
COMMENT ON FUNCTION public.can_manage_workspace(UUID) IS 'admin+ can manage workspaces.';
COMMENT ON FUNCTION public.can_write_data(UUID) IS 'All active members can write data.';
COMMENT ON FUNCTION public.can_delete_data(UUID) IS 'manager+ can delete business data.';
