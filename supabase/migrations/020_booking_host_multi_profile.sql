-- ============================================================
-- Migration 020: Allow multiple host profiles per user per org
-- ============================================================
-- Удаляем constraint booking_host_profiles_org_user_unique,
-- который ограничивал одного юзера одним хост-профилем на орг.
--
-- Причина: владелец орга должен иметь возможность создавать
-- несколько специалистов (хостов) в рамках одной организации.
-- Уникальность хоста обеспечивается slug'ом (org_slug_unique).
--
-- user_id остаётся как audit/link поле, но больше не уникален.
-- ============================================================

ALTER TABLE public.booking_host_profiles
  DROP CONSTRAINT IF EXISTS booking_host_profiles_org_user_unique;
