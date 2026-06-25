-- =============================================================================
-- Migration 025: Member Invites (invited + accept flow) + members limit
--
-- Модель: пригласить существующего юзера по email → membership status='invited';
-- приглашённый принимает (accept) → status='active'.
--
-- Безопасность:
--   - invite/accept/decline идут через SECURITY DEFINER RPC, т.к.:
--       * вставка чужого user_id в memberships запрещена RLS (self-bootstrap only);
--       * accept (invited→active) не проходит под memberships_update (is_org_admin);
--       * нужен доступ к auth.users для поиска по email.
--   - лимит участников плана проверяется ВНУТРИ invite_member (нельзя обойти
--     прямым вызовом RPC мимо server action).
--   - добавлена self-select RLS политика, чтобы приглашённый видел свой invite.
--
-- members limit = active + invited (pending invite держит место).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS: пользователь видит свои собственные membership-строки (любой статус)
--    OR-ится с memberships_select (is_org_member). Нужно, чтобы invited-юзер
--    (ещё не активный член) увидел свой pending-invite.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
CREATE POLICY "memberships_select_own"
  ON public.memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. invite_member() — пригласить существующего юзера по email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_member(
  p_org_id UUID,
  p_email  TEXT,
  p_role   TEXT DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller  UUID;
  v_target  UUID;
  v_limit   INT;
  v_count   INT;
  v_id      UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Только owner/admin приглашают
  IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF p_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  -- Поиск приглашаемого среди зарегистрированных пользователей
  SELECT id INTO v_target
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;

  -- Уже в организации?
  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = p_org_id AND user_id = v_target
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  -- Лимит плана (active + invited). NULL/-1 = без лимита (legacy орги без подписки).
  SELECT pl.max_members INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans pl ON pl.id = bs.plan_id
  WHERE bs.organization_id = p_org_id;

  IF v_limit IS NOT NULL AND v_limit <> -1 THEN
    SELECT count(*) INTO v_count
    FROM public.memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited');

    IF v_count >= v_limit THEN RAISE EXCEPTION 'member_limit_reached'; END IF;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_target, p_org_id, p_role, 'invited')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.invite_member(UUID, TEXT, TEXT) IS
  'Invite existing user by email → membership status=invited. Admin-only, '
  'enforces plan member limit (active+invited). SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- 3. accept_invite() — приглашённый принимает (invited → active)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.memberships
  SET status = 'active', updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = v_user
    AND status = 'invited';

  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
END;
$$;

COMMENT ON FUNCTION public.accept_invite(UUID) IS
  'Invited user accepts: own membership invited→active. SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- 4. decline_invite() — приглашённый отклоняет (удаляет свой invite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_invite(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  DELETE FROM public.memberships
  WHERE organization_id = p_org_id
    AND user_id = v_user
    AND status = 'invited';
END;
$$;

COMMENT ON FUNCTION public.decline_invite(UUID) IS
  'Invited user declines: deletes own invited membership. SECURITY DEFINER.';
