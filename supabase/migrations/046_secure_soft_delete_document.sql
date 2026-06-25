-- Keep ordinary document updates scoped to writers. Soft deletion needs a
-- dedicated path because PostgREST re-checks the SELECT policy after the row
-- becomes hidden by deleted_at.
DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

CREATE OR REPLACE FUNCTION public.soft_delete_document(
  p_document_id UUID,
  p_organization_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_document_id UUID;
BEGIN
  IF NOT public.can_delete_data(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.documents
  SET deleted_at = now(), updated_by = auth.uid()
  WHERE id = p_document_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING id INTO v_document_id;

  IF v_document_id IS NULL THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_document(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(UUID, UUID) TO authenticated;
