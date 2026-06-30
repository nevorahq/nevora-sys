-- Settings module preferences. Business data remains organization-scoped.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_check CHECK (language IN ('en', 'ru'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_business_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_type_check CHECK (
    business_type IN ('freelancer', 'beauty_services', 'small_business', 'developer_agency', 'other')
  );

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_default_language_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_default_language_check CHECK (default_language IN ('en', 'ru'));

-- Settings access model allows both owner and admin to update workspace settings.
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

COMMENT ON COLUMN public.organizations.business_type IS
  'Used for future templates and AI personalization; never enables modules automatically.';
