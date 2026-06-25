-- ============================================================
-- Phase 2 — Migration 001: Multi-Tenant Core Schema
-- ============================================================
-- Порядок: organizations → memberships → workspaces
-- Идемпотентно: безопасно запускать повторно.
-- ============================================================

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================
-- Корневая сущность мультитенантности. Всё принадлежит org.
--
-- plan: определяет лимиты функционала.
--   free → pro → enterprise (upgrading путь).
--   DEFAULT 'free' — все новые orgs стартуют бесплатно.
--
-- slug: human-readable URL-идентификатор (acme-corp.nevora.app).
--   UNIQUE — гарантирует уникальность на уровне БД.
--   NULL пока не обязателен (можно заполнить позже через миграцию данных).

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE,
  plan       TEXT NOT NULL DEFAULT 'free'
               CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'Root tenant entity. All business data belongs to an organization.';

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON public.organizations(slug);

-- auto-update updated_at
DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 2. MEMBERSHIPS
-- ============================================================
-- Связь user ↔ organization с ролью.
--
-- Роли (иерархия, от старшей к младшей):
--   owner    — единственный, может удалить org, передать ownership
--   admin    — управляет участниками, биллингом, workspace
--   manager  — управляет рабочим пространством, данными
--   member   — только чтение + базовые write-операции
--
-- UNIQUE(user_id, organization_id) — один user не может иметь
-- дублирующееся членство в одной org.
--
-- status: 'active' | 'invited' | 'suspended'
--   invited — приглашён, но ещё не принял
--   suspended — временно заблокирован без удаления

CREATE TABLE IF NOT EXISTS public.memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'invited', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

COMMENT ON TABLE public.memberships IS 'User-organization membership with RBAC roles.';

CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_org_id_idx ON public.memberships(organization_id);
-- Composite index для security functions (наиболее частый запрос)
CREATE INDEX IF NOT EXISTS memberships_user_org_idx ON public.memberships(user_id, organization_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS memberships_updated_at ON public.memberships;
CREATE TRIGGER memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 3. WORKSPACES
-- ============================================================
-- Опциональный сегментационный слой внутри org.
-- Примеры: "Marketing", "Engineering", "Sales"
--
-- Зачем: крупные org хотят разделить данные по командам.
-- В MVP workspace может быть один (default).
-- В enterprise — множество workspaces с отдельными правами.
--
-- type: зарезервировано для будущей семантики (project, department, team)

CREATE TABLE IF NOT EXISTS public.workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT DEFAULT 'default'
                    CHECK (type IN ('default', 'project', 'department', 'team')),
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspaces IS 'Segmentation layer inside an organization (team, project, department).';

CREATE INDEX IF NOT EXISTS workspaces_org_id_idx ON public.workspaces(organization_id);

DROP TRIGGER IF EXISTS workspaces_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
