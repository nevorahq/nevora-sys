-- =============================================================================
-- Migration 028: Safe member contact details
--
-- auth.users is intentionally not exposed through the client API. This narrow
-- SECURITY DEFINER function returns emails only when the caller is an active
-- member of the same organization.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_member_contact_details(p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT m.user_id, u.email::TEXT
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org_id;
END;
$$;

COMMENT ON FUNCTION public.get_org_member_contact_details(UUID) IS
  'Returns member email addresses only to active members of the same organization.';
