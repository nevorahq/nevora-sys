-- Phase 1 hardening: complete the event query indexes and constrain direct
-- event writes to users who can write data in the active organization.
CREATE INDEX IF NOT EXISTS domain_events_workspace_id_idx
  ON public.domain_events (workspace_id);
CREATE INDEX IF NOT EXISTS domain_events_created_at_idx
  ON public.domain_events (created_at DESC);

DROP POLICY IF EXISTS "domain_events_insert" ON public.domain_events;
CREATE POLICY "domain_events_insert"
  ON public.domain_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );
