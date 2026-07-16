-- Widen language CHECK constraints to include Romanian ('ro').
--
-- The app now ships a full Romanian interface (dictionaries/ro.ts), so the
-- persisted language preferences (profiles.language, organizations.default_language)
-- must accept 'ro'. Migration 065 pinned them to ('en','ru').
--
-- Idempotent: drops the constraint if present, re-adds the widened one.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_check CHECK (language IN ('en', 'ru', 'ro'));

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_default_language_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_default_language_check CHECK (default_language IN ('en', 'ru', 'ro'));
