-- ============================================================
-- Migration 068: get_pending_invites() — RLS-safe pending invite lookup
-- ============================================================
-- Phase 4.3 (Core Platform: Organization Context & Invite Acceptance).
--
-- Проблема, найденная в live QA: пользователю нужно видеть organization_name
-- своих pending-приглашений (memberships.status='invited'), чтобы решить,
-- принять их или отклонить. Обычный select с nested join через PostgREST
-- этого не даёт: RLS SELECT на public.organizations идёт через
-- is_org_member() (002_security_functions.sql), который требует
-- status = 'active'. У invited-пользователя активного membership в этой
-- org ещё нет — join на organizations молча вернёт NULL, хотя саму
-- membership-строку он видит (memberships_select_own, 025).
--
-- Решение зеркалит уже существующий паттерн get_invite_info/accept_invite/
-- decline_invite (025, 026): SECURITY DEFINER-функция без внешних
-- параметров, которая обходит RLS безопасно — фильтрует строго по
-- auth.uid() вызывающего. Cross-tenant утечка невозможна: нет параметра,
-- который можно было бы подменить.

CREATE OR REPLACE FUNCTION public.get_pending_invites()
RETURNS TABLE (
  organization_id   UUID,
  organization_name TEXT,
  role              TEXT,
  created_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    m.organization_id,
    o.name,
    m.role,
    m.created_at
  FROM public.memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'invited'
  ORDER BY m.created_at ASC;
$$;

COMMENT ON FUNCTION public.get_pending_invites() IS
  'AUTHENTICATED-ONLY SECURITY DEFINER RPC: возвращает pending-приглашения '
  '(memberships.status=invited) ТОЛЬКО для auth.uid() вызывающего — обходит '
  'RLS на organizations (is_org_member требует active), без параметров, '
  'cross-tenant утечка невозможна. Зеркалит accept_invite/decline_invite (025).';

REVOKE ALL ON FUNCTION public.get_pending_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_invites() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_invites() TO authenticated;
