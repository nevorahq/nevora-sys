-- ============================================================
-- Migration 085: purge a deleted transaction from Action Center + dropdown
-- ============================================================
-- A money transaction is HARD deleted, so none of the soft-delete triggers fire:
-- its Action Center items stay "open" and its delivered notifications keep a
-- target_url like /dashboard/money/<id> that now 404s when clicked from the
-- notifications dropdown.
--
-- This RPC (called from deleteTransactionAction) cleans both up:
--   1. Cancel + soft-delete the transaction's action_items, so the feed, the
--      unread counter and the embed-filtered dropdown list all drop them.
--   2. Delete any notifications pointing at the deleted transaction by
--      target_url — this also covers standalone reminder notifications that have
--      no action_item_id (which the list filter alone cannot catch).
--
-- SECURITY DEFINER because notifications has no DELETE policy (deletes are
-- otherwise denied); the function is strictly org-scoped and permission-checked.

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_transaction_from_action_center(
  p_organization_id uuid,
  p_transaction_id  uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_write_data(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 1. Retire the transaction's Action Center items.
  UPDATE public.action_items
    SET status = 'cancelled', deleted_at = now(), updated_at = now()
    WHERE organization_id = p_organization_id
      AND source_type = 'transaction'
      AND source_id = p_transaction_id
      AND deleted_at IS NULL;

  -- 2. Remove delivered notifications that point at the deleted transaction
  --    (any recipient in the org), including reminder rows with no action item.
  DELETE FROM public.notifications
    WHERE organization_id = p_organization_id
      AND target_url = '/dashboard/money/' || p_transaction_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_transaction_from_action_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_transaction_from_action_center(uuid, uuid) TO authenticated;

COMMIT;
