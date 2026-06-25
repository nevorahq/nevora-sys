-- ============================================================
-- Migration 019: Auto-initialize booking_pages for all orgs
-- ============================================================
-- Проблема: booking_pages запись должна существовать для каждой
-- организации, иначе публичные URL /booking/[slug] возвращают 404.
-- public_enabled = false по умолчанию — страница скрыта,
-- пока администратор явно не включит её в настройках.
-- ============================================================

-- ── 1. Создаём записи для существующих организаций ────────────
INSERT INTO public.booking_pages (
  organization_id,
  organization_slug,
  slug,
  title,
  public_enabled,
  default_timezone
)
SELECT
  o.id,
  o.slug,
  o.slug,
  o.name,
  false,                     -- скрыта до явного включения
  'Europe/Chisinau'
FROM public.organizations o
WHERE
  o.slug IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_pages bp
    WHERE bp.organization_id = o.id
  )
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ── 2. Функция: автосоздание при создании организации ─────────
CREATE OR REPLACE FUNCTION public.auto_create_booking_page()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    INSERT INTO public.booking_pages (
      organization_id,
      organization_slug,
      slug,
      title,
      public_enabled,
      default_timezone
    ) VALUES (
      NEW.id,
      NEW.slug,
      NEW.slug,
      NEW.name,
      false,
      'Europe/Chisinau'
    )
    ON CONFLICT (organization_id, slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Триггер на INSERT в organizations ──────────────────────
DROP TRIGGER IF EXISTS organizations_auto_booking_page ON public.organizations;
CREATE TRIGGER organizations_auto_booking_page
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_booking_page();

-- ── 4. Триггер на UPDATE slug в organizations ─────────────────
-- Если slug организации установлен впервые (был NULL, стал NOT NULL)
-- — создаём booking page.
CREATE OR REPLACE FUNCTION public.auto_create_booking_page_on_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.slug IS NULL AND NEW.slug IS NOT NULL THEN
    INSERT INTO public.booking_pages (
      organization_id,
      organization_slug,
      slug,
      title,
      public_enabled,
      default_timezone
    ) VALUES (
      NEW.id,
      NEW.slug,
      NEW.slug,
      NEW.name,
      false,
      'Europe/Chisinau'
    )
    ON CONFLICT (organization_id, slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_slug_booking_page ON public.organizations;
CREATE TRIGGER organizations_slug_booking_page
  AFTER UPDATE OF slug ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_booking_page_on_slug();
