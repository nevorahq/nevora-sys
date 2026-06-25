-- ============================================================
-- Migration 017: CRM Extension for Booking Module
-- ============================================================
-- Расширяем crm_clients для поддержки booking как источника лидов:
--
-- 1. Добавляем 'booking' в CHECK constraint source
-- 2. Добавляем source_entity_type + source_entity_id (для cross-linking)
--    Это заложит основу для будущих omnichannel источников:
--    phone/email/telegram/instagram/website_chat
--
-- Изменения не ломают существующие данные.
-- ============================================================


-- ── 1. Расширяем CHECK constraint на crm_clients.source ──────────────────────
-- Удаляем старый constraint и создаём новый с 'booking'.
ALTER TABLE public.crm_clients
  DROP CONSTRAINT IF EXISTS crm_clients_source_check;

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_source_check
  CHECK (source IN ('manual', 'import', 'api', 'form', 'referral', 'booking'));


-- ── 2. Добавляем source_entity_type и source_entity_id ───────────────────────
-- Позволяет CRM знать, откуда пришёл лид (booking_request, phone_call, etc.)
-- Используется для: deep-link в UI, analytics, omnichannel future routing.
ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id   UUID;

COMMENT ON COLUMN public.crm_clients.source_entity_type IS
  'Entity type that originated this lead: booking_request, phone_call, etc.';
COMMENT ON COLUMN public.crm_clients.source_entity_id IS
  'UUID of the source entity (booking_requests.id, etc.).';

CREATE INDEX IF NOT EXISTS crm_clients_source_entity_idx
  ON public.crm_clients(source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;
