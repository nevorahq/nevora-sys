-- ============================================================
-- Migration 120: QR / barcode scanned with an Inbox capture
-- ============================================================
-- The Inbox "Scan" mode reads a QR code or barcode off a receipt or invoice
-- and uploads it together with the photo. The decoded payload is kept on the
-- Document so extraction (which runs after the response, and again from the
-- cron sweep or a retry) can hand it to the model and cross-check the header.
--
-- Stored shape: {"raw": "<payload, <= 2000 chars>", "format": "qr_code" | ...}.
-- The server re-parses `raw` on every read; nothing derived is trusted from
-- the row. NULL for every Document not captured by scanning.
--
-- Additive and idempotent: safe to re-run. No RLS change — the column rides
-- the existing documents policies.

BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS capture_code jsonb NULL;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_capture_code_shape;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_capture_code_shape
  CHECK (
    capture_code IS NULL
    OR (
      jsonb_typeof(capture_code) = 'object'
      AND jsonb_typeof(capture_code -> 'raw') = 'string'
      AND length(capture_code ->> 'raw') BETWEEN 1 AND 2000
    )
  );

COMMENT ON COLUMN public.documents.capture_code IS
  'QR/barcode scanned with an Inbox capture: {raw, format}. Re-parsed server-side; a hint for extraction, never posted as money.';

COMMIT;

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'documents' AND column_name = 'capture_code';   -- jsonb
