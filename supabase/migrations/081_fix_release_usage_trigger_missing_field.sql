-- ============================================================
-- Migration 081: Fix release_product_usage_on_removal() 42703
-- ============================================================
-- BUG (introduced in 072): release_product_usage_on_removal() is a polymorphic
-- trigger function shared across todos / documents / money_transactions /
-- developer_api_keys / developer_webhooks / subscriptions, keyed by TG_ARGV[0].
-- Its body used a single `CASE v_key WHEN ... THEN <expr> ...` whose arms
-- reference table-specific columns: OLD.revoked_at / NEW.revoked_at
-- (developer_api_keys) and OLD.is_active (developer_webhooks).
--
-- PL/pgSQL plans the WHOLE case expression against the row type of OLD/NEW at
-- first execution. For a trigger attached to `documents` (or `todos`,
-- `money_transactions`), OLD is `documents%ROWTYPE`, which has no `revoked_at`
-- column, so planning fails with:
--     42703  record "old" has no field "revoked_at"
-- Result: EVERY soft-delete (UPDATE OF deleted_at) on documents / todos /
-- money_transactions raised 42703 and surfaced in the UI as
-- "Failed to delete document". CASE short-circuiting does not help — this is a
-- plan-time error, not a runtime branch decision.
--
-- FIX: replace the single CASE with IF/ELSIF branches on v_key. Each branch is a
-- separate PL/pgSQL statement, planned lazily only when that branch actually
-- runs — so `OLD.revoked_at` is only ever planned for the developer_api_keys
-- trigger, `OLD.is_active` only for developer_webhooks, etc. No behavior change;
-- only the missing-field planning error is removed. Triggers are unchanged
-- (CREATE OR REPLACE swaps the body in place).

BEGIN;

CREATE OR REPLACE FUNCTION public.release_product_usage_on_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id UUID;
  v_key TEXT := TG_ARGV[0];
  v_should_release BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id;
    -- Branch per key so each column reference is planned lazily and only against
    -- a table that actually has that column.
    IF v_key IN ('tasks.count', 'documents.count', 'money_transactions.count') THEN
      v_should_release := OLD.deleted_at IS NULL;
    ELSIF v_key = 'developer_api_keys.count' THEN
      v_should_release := OLD.revoked_at IS NULL;
    ELSIF v_key = 'developer_webhooks.count' THEN
      v_should_release := OLD.is_active;
    ELSIF v_key = 'subscriptions.count' THEN
      v_should_release := true;
    ELSE
      v_should_release := false;
    END IF;
  ELSE
    v_org_id := NEW.organization_id;
    IF v_key IN ('tasks.count', 'documents.count', 'money_transactions.count') THEN
      v_should_release := OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL;
    ELSIF v_key = 'developer_api_keys.count' THEN
      v_should_release := OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL;
    ELSIF v_key = 'developer_webhooks.count' THEN
      v_should_release := OLD.is_active AND NOT NEW.is_active;
    ELSE
      v_should_release := false;
    END IF;
  END IF;

  IF v_should_release THEN
    UPDATE public.organization_usage_counters
    SET value = greatest(value - 1, 0), updated_at = now()
    WHERE organization_id = v_org_id
      AND key = v_key
      AND period_start = '-infinity'::timestamptz;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_product_usage_on_removal() FROM PUBLIC;

COMMIT;
