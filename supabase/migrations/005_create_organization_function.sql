-- ============================================================
-- Phase 2 — Migration 005: create_organization() RPC Function
-- ============================================================
-- Вызывается из Server Action (create-organization.action.ts).
--
-- Почему SECURITY DEFINER:
--   При создании org у пользователя ещё НЕТ membership.
--   RLS на INSERT в organizations разрешает любой auth user (WITH CHECK true),
--   но INSERT в memberships требует user_id = auth.uid() (self-join bootstrap).
--   Функция выполняет оба INSERT атомарно в одной транзакции.
--
-- Атомарность:
--   Если INSERT memberships упадёт — INSERT organizations откатится.
--   Никогда не будет org без owner.
--
-- search_path заблокирован — защита от search_path injection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;
BEGIN
  v_user_id := auth.uid();

  -- Проверка аутентификации
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Проверка: пользователь уже состоит в какой-то org?
  -- Позволяем создавать несколько org — убрать IF если нужно ограничить.

  -- Валидация slug (дублирует Zod — fail fast на уровне БД)
  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- 1. Создаём организацию
  INSERT INTO public.organizations (name, slug, plan)
  VALUES (trim(p_name), lower(trim(p_slug)), 'free')
  RETURNING id INTO v_org_id;

  -- 2. Создаём owner membership
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user_id, v_org_id, 'owner', 'active');

  -- 3. Создаём default workspace
  -- slug генерируется из org slug + '-general' для уникальности
  INSERT INTO public.workspaces (organization_id, name, slug, type, is_default)
  VALUES (v_org_id, 'General', lower(trim(p_slug)) || '-general', 'default', true);

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.create_organization(TEXT, TEXT) IS
  'Atomically creates org + owner membership + default workspace. '
  'Called from onboarding Server Action. SECURITY DEFINER for RLS bootstrap.';
