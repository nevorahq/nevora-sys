-- =============================================================================
-- Migration 076: Phase 7.3 — atomic member-seat enforcement
-- =============================================================================
--
-- Problem (audit P1-1): the member/seat limit was enforced by a check → insert
-- pattern (app-level `checkPlanLimit('members')` and a COUNT inside
-- `invite_member` / `accept_invite_link`). Two concurrent invites can both read
-- `count < limit` and both insert, overshooting the paid seat cap.
--
-- Fix: a BEFORE INSERT trigger on `public.memberships` that serializes concurrent
-- inserts per organization with a transaction-scoped advisory lock, then enforces
-- the plan's `max_members` cap against live seat occupancy (active + invited).
-- Because every membership INSERT path — `invite_member`, `accept_invite`,
-- `accept_invite_link`, `create_organization` — flows through this table, the cap
-- becomes atomic and unbypassable regardless of the calling code. The existing
-- COUNT checks remain as friendly early exits; this trigger is authoritative.
--
-- Compatibility:
--   * No billing subscription yet (e.g. the owner row inserted during
--     `create_organization`, before `init_trial_subscription` runs) => no cap.
--   * NULL or -1 `max_members` => unlimited (matches `accept_invite_link`).
--   * Only 'active' and 'invited' rows occupy a seat; other statuses are ignored.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_member_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only occupied seats count. Declined/removed memberships are deleted rather
  -- than flagged, so (active + invited) is the live seat occupancy.
  IF NEW.status NOT IN ('active', 'invited') THEN
    RETURN NEW;
  END IF;

  -- Resolve the plan seat cap. A missing subscription (legacy org, or the
  -- owner row created before the trial subscription exists) and NULL/-1 both
  -- mean "no cap" and skip the lock entirely to avoid needless contention.
  SELECT p.max_members INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = NEW.organization_id
  LIMIT 1;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent member inserts for THIS organization. The lock is
  -- transaction-scoped: a racing invite blocks here until the first commits,
  -- so its subsequent COUNT observes the committed row and cannot overshoot.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 0));

  SELECT count(*) INTO v_count
  FROM public.memberships
  WHERE organization_id = NEW.organization_id
    AND status IN ('active', 'invited');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING ERRCODE = 'P0001',
            DETAIL = format('key=members current=%s limit=%s', v_count, v_limit);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_member_seat_limit() FROM PUBLIC;

COMMENT ON FUNCTION public.enforce_member_seat_limit() IS
  'Phase 7.3 (P1-1): atomic seat cap on memberships INSERT. Serializes per-org '
  'with an advisory xact lock so concurrent invites cannot overshoot max_members. '
  'No subscription / NULL / -1 => unlimited. Only active+invited occupy a seat.';

DROP TRIGGER IF EXISTS enforce_member_seat_limit ON public.memberships;
CREATE TRIGGER enforce_member_seat_limit
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_seat_limit();
