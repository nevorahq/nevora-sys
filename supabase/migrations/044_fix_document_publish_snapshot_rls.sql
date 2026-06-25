-- Publishing a document creates an immutable version from a trigger. The
-- versions table intentionally has no INSERT policy for authenticated users,
-- therefore the trigger function must run with its owner privileges.
CREATE OR REPLACE FUNCTION public.snapshot_document_on_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_next_version INT;
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_next_version
      FROM public.document_versions
      WHERE document_id = NEW.id;

    INSERT INTO public.document_versions (
      document_id, organization_id, version_number, title, content, created_by
    ) VALUES (
      NEW.id, NEW.organization_id, v_next_version, NEW.title, NEW.content, NEW.updated_by
    );
  END IF;

  RETURN NEW;
END;
$$;
