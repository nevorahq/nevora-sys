-- A document delete is implemented as a soft-delete (UPDATE deleted_at).
-- Keep normal edits behind can_write_data, but allow a manager/admin/owner
-- to transition an active document to deleted using can_delete_data.
DROP POLICY IF EXISTS "documents_update" ON public.documents;

CREATE POLICY "documents_update"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_write_data(organization_id)
      OR public.can_delete_data(organization_id)
    )
  )
  WITH CHECK (
    (
      deleted_at IS NULL
      AND public.can_write_data(organization_id)
    )
    OR (
      deleted_at IS NOT NULL
      AND public.can_delete_data(organization_id)
    )
  );
