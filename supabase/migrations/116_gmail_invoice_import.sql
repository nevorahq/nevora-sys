-- Gmail invoice import credentials and idempotency markers.
-- Both tables are backend-only: authenticated/anon receive no table grants.

BEGIN;

CREATE TABLE public.gmail_connections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_address            TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scopes                   TEXT[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

COMMENT ON TABLE public.gmail_connections IS
  'Backend-only Gmail OAuth connections. Refresh tokens are AES-256-GCM encrypted by the app before persistence.';

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gmail_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gmail_connections TO service_role;

CREATE TABLE public.gmail_invoice_imports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id      UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  gmail_message_id     TEXT NOT NULL,
  gmail_attachment_key TEXT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('importing', 'imported')),
  document_id          UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  UNIQUE (organization_id, subscription_id, gmail_message_id, gmail_attachment_key)
);

COMMENT ON TABLE public.gmail_invoice_imports IS
  'Backend-only idempotency register preventing duplicate Gmail attachment imports.';

CREATE INDEX gmail_invoice_imports_document_idx
  ON public.gmail_invoice_imports (organization_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE public.gmail_invoice_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gmail_invoice_imports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gmail_invoice_imports TO service_role;

COMMIT;
