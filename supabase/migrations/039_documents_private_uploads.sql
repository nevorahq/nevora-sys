-- Documents upload hardening: private bucket, attachment lifecycle metadata,
-- and storage RLS. Object names intentionally start with `documents/` so the
-- persisted path is stable even if the storage backend changes later.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'documents',
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS safe_filename TEXT,
  ADD COLUMN IF NOT EXISTS extension TEXT,
  ADD COLUMN IF NOT EXISTS client_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS detected_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS preview_status TEXT NOT NULL DEFAULT 'not_available',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.document_attachments
SET storage_path = COALESCE(storage_path, file_path),
    original_filename = COALESCE(original_filename, file_name),
    safe_filename = COALESCE(safe_filename, file_name),
    extension = COALESCE(extension, lower(regexp_replace(file_name, '^.*\\.', ''))),
    client_mime_type = COALESCE(client_mime_type, mime_type),
    size_bytes = COALESCE(size_bytes, file_size)
WHERE storage_path IS NULL
   OR original_filename IS NULL
   OR safe_filename IS NULL
   OR extension IS NULL
   OR size_bytes IS NULL;

ALTER TABLE public.document_attachments
  ALTER COLUMN storage_path SET NOT NULL,
  ALTER COLUMN original_filename SET NOT NULL,
  ALTER COLUMN safe_filename SET NOT NULL,
  ALTER COLUMN extension SET NOT NULL,
  ALTER COLUMN size_bytes SET NOT NULL;

ALTER TABLE public.document_attachments
  DROP CONSTRAINT IF EXISTS document_attachments_extension_check,
  ADD CONSTRAINT document_attachments_extension_check CHECK (extension IN ('pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif')),
  DROP CONSTRAINT IF EXISTS document_attachments_upload_status_check,
  ADD CONSTRAINT document_attachments_upload_status_check CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  DROP CONSTRAINT IF EXISTS document_attachments_scan_status_check,
  ADD CONSTRAINT document_attachments_scan_status_check CHECK (scan_status IN ('not_scanned', 'pending', 'clean', 'failed')),
  DROP CONSTRAINT IF EXISTS document_attachments_preview_status_check,
  ADD CONSTRAINT document_attachments_preview_status_check CHECK (preview_status IN ('not_available', 'pending', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS document_attachments_storage_path_idx ON public.document_attachments(storage_path);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The organization UUID is the second object-name segment:
-- documents/{organization_id}/{workspace_id}/{document_id}/{attachment_id}/{safe_filename}.
DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
CREATE POLICY "documents_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND public.is_org_member((storage.foldername(name))[2]::uuid));

DROP POLICY IF EXISTS "documents_storage_insert" ON storage.objects;
CREATE POLICY "documents_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'documents'
  AND public.can_write_data((storage.foldername(name))[2]::uuid)
);

DROP POLICY IF EXISTS "documents_storage_delete" ON storage.objects;
CREATE POLICY "documents_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.can_delete_data((storage.foldername(name))[2]::uuid));
