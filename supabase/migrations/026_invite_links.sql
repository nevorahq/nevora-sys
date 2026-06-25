-- =============================================================================
-- Migration 026: Invite Links (token-based invites, без email-инфраструктуры)
--
-- Owner/admin генерирует ссылку-приглашение и делится ею сам. Приглашённый
-- (в т.ч. ещё не зарегистрированный) открывает /invite/<token>, входит/регится
-- и принимает — membership создаётся сразу active.
--
-- Безопасность:
--   - создание/принятие через SECURITY DEFINER RPC;
--   - лимит участников плана enforce-ится при ПРИНЯТИИ (accept), т.к. до этого
--     неизвестно, сколько ссылок реально будут использованы;
--   - токен = два gen_random_uuid() без дефисов (64 hex), без pgcrypto.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token            TEXT        NOT NULL UNIQUE,
  role             TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_by       UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by      UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org ON public.organization_invites (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.organization_invites (token);

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- Админы видят и управляют инвайтами своей org (для списка/отзыва).
-- Создание/принятие идут через RPC (SECURITY DEFINER) — анониму/приглашённому
-- прямой доступ к таблице НЕ даётся (детали инвайта только через get_invite_info).
DROP POLICY IF EXISTS "org_invites_admin_select" ON public.organization_invites;
CREATE POLICY "org_invites_admin_select"
  ON public.organization_invites FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_invites_admin_write" ON public.organization_invites;
CREATE POLICY "org_invites_admin_write"
  ON public.organization_invites FOR ALL
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- create_invite_link() — owner/admin создаёт ссылку-приглашение
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invite_link(
  p_org_id UUID,
  p_role   TEXT DEFAULT 'member'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.organization_invites (organization_id, token, role, created_by)
  VALUES (p_org_id, v_token, p_role, auth.uid());

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.create_invite_link(UUID, TEXT) IS
  'Admin creates a token invite link. Returns token. SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- get_invite_info() — публичная инфа об инвайте по токену (для /invite/<token>)
-- Возвращает имя org и валидность; доступна и анониму (до входа).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token TEXT)
RETURNS TABLE (
  organization_id   UUID,
  organization_name TEXT,
  role              TEXT,
  valid             BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    oi.organization_id,
    o.name,
    oi.role,
    (oi.status = 'pending' AND oi.expires_at > now()) AS valid
  FROM public.organization_invites oi
  JOIN public.organizations o ON o.id = oi.organization_id
  WHERE oi.token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_invite_info(TEXT) IS
  'Public-readable invite info by token (org name, role, validity).';

-- ---------------------------------------------------------------------------
-- accept_invite_link() — приглашённый принимает; membership создаётся active.
-- Здесь enforce лимит участников плана (active + invited).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_link(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user  UUID;
  v_org   UUID;
  v_role  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT organization_id, role INTO v_org, v_role
  FROM public.organization_invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  IF v_org IS NULL THEN RAISE EXCEPTION 'invite_invalid'; END IF;

  -- Уже участник? Помечаем инвайт принятым и выходим без ошибки.
  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = v_org AND user_id = v_user
  ) THEN
    UPDATE public.organization_invites
    SET status = 'accepted', accepted_by = v_user, accepted_at = now()
    WHERE token = p_token;
    RETURN v_org;
  END IF;

  -- Лимит плана (active + invited)
  SELECT pl.max_members INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans pl ON pl.id = bs.plan_id
  WHERE bs.organization_id = v_org;

  IF v_limit IS NOT NULL AND v_limit <> -1 THEN
    SELECT count(*) INTO v_count
    FROM public.memberships
    WHERE organization_id = v_org AND status IN ('active', 'invited');
    IF v_count >= v_limit THEN RAISE EXCEPTION 'member_limit_reached'; END IF;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user, v_org, v_role, 'active');

  UPDATE public.organization_invites
  SET status = 'accepted', accepted_by = v_user, accepted_at = now()
  WHERE token = p_token;

  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.accept_invite_link(TEXT) IS
  'Accept token invite → membership active. Enforces plan member limit. SECURITY DEFINER.';
