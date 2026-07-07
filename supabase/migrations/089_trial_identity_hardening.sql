-- =============================================================================
-- Migration 089: Trial Identity Hardening & Entitlement Control Plane
--
-- Развивает 086 (Trial Reuse Protection). Три цели:
--
--   1. Псевдонимная billing-identity на HMAC-SHA256 (а не «голом» sha256).
--      086 хранил normalized_email_hash = sha256(lower(trim(email))) без
--      секрета — перечислимо (rainbow-table по email). Здесь вводим keyed
--      HMAC с серверным pepper (billing_identity_pepper) и реестр
--      billing_identities. sha256-колонка сохраняется для обратной
--      совместимости, enforcement переносится на identity_hash.
--
--   2. Единый entitlement-контракт для app-слоя (типизированные reason codes
--      и access states) — RPC ниже. Никакого client payload: identity и
--      организация выводятся из auth.uid() + membership.
--
--   3. DB — финальная граница: повторный trial невозможен даже при гонке
--      (UNIQUE(identity_hash) + UNIQUE(organization_id)); claim пишется только
--      SECURITY DEFINER функциями, никакого service role в app-логике.
--
-- Переиспользуем существующее (НЕ дублируем таблицы):
--   * organization_billing_states  → billing_subscriptions (012/027) — это и
--     есть состояние биллинга организации; get_organization_access_state
--     читает её и разворачивает в типизированный access state.
--   * security_events              → domain_events (006/087/088). Имена
--     billing.* авто-классифицируются как activity_type='security'
--     (видно только owner/admin) — сырой email туда НЕ пишется.
--   * can_manage_billing(uuid)     → уже есть в 002 (owner-only). Переиспользуем.
--
-- Идемпотентность: CREATE TABLE/COLUMN/FUNCTION ... IF NOT EXISTS / OR REPLACE,
-- констрейнты добавляются через catalog-guard. Безопасно применять повторно.
--
-- Предпосылка (pepper): секрет генерируется автоматически при первом применении
-- (extensions.gen_random_bytes) и хранится в private.app_secrets — НЕ в git, не
-- доступен через PostgREST (схема private не экспонируется). Ротация — раздел
-- ROLLBACK/ROTATION ниже.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK / ROTATION NOTES
-- ---------------------------------------------------------------------------
-- Полный откат (потеря HMAC-идентичностей — enforcement вернётся на sha256):
--   DROP FUNCTION IF EXISTS public.claim_trial_for_current_user(uuid);
--   DROP FUNCTION IF EXISTS public.get_trial_eligibility_for_current_user();
--   DROP FUNCTION IF EXISTS public.get_organization_access_state(uuid);
--   DROP FUNCTION IF EXISTS public.can_write_org(uuid);
--   ALTER TABLE public.billing_trial_claims
--     DROP CONSTRAINT IF EXISTS billing_trial_claims_identity_hash_key,
--     DROP CONSTRAINT IF EXISTS billing_trial_claims_organization_id_key,
--     DROP COLUMN IF EXISTS identity_hash,
--     DROP COLUMN IF EXISTS identity_id;
--   DROP TABLE IF EXISTS public.billing_identities;
--   DROP FUNCTION IF EXISTS public.billing_identity_hash(text);
--   DROP FUNCTION IF EXISTS public.billing_identity_pepper();
--   -- private.app_secrets и init_trial_subscription из 086 при этом надо
--   -- вернуть на 086-версию (перезалить 086 секцию 4) — иначе init_trial
--   -- сошлётся на billing_identity_hash. Проще откатывать вместе с 086.
--
-- Ротация pepper (инвалидирует ВСЕ HMAC-идентичности — старые claim перестанут
-- матчиться по identity_hash, но sha256 back-compat колонка продолжит ловить
-- повтор по email; после ротации пересчитайте identity_hash из auth.users):
--   UPDATE private.app_secrets SET value = encode(extensions.gen_random_bytes(32),'hex'),
--          updated_at = now() WHERE key = 'trial_identity_pepper';
--   UPDATE public.billing_trial_claims c
--     SET identity_hash = public.billing_identity_hash(u.email)
--     FROM auth.users u WHERE u.id = c.user_id AND u.email IS NOT NULL;
--   -- + пересобрать billing_identities.identity_hash аналогично.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. private.app_secrets — серверный секрет (pepper). Не в git, не в PostgREST.
--    Схема private не входит в exposed schemas Supabase → недоступна anon/
--    authenticated через API. RLS включаем без политик = deny-by-default даже
--    если схему когда-нибудь экспонируют.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE USAGE ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.app_secrets FROM PUBLIC, anon, authenticated;

-- Автосев pepper при первом применении. 32 случайных байта в hex.
-- ON CONFLICT DO NOTHING → повторный запуск миграции не перегенерирует секрет.
INSERT INTO private.app_secrets (key, value)
VALUES ('trial_identity_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. billing_identity_pepper() — читает секрет. SECURITY DEFINER (владелец
--    имеет USAGE на private). Internal-only: никаких грантов app-ролям.
--    Fail-closed: без секрета — исключение (лучше не выдать trial, чем выдать
--    с пустым ключом, что уравняло бы HMAC с предсказуемым значением).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_identity_pepper()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  -- 1) GUC override (например ALTER DATABASE ... SET app.trial_identity_pepper)
  v_secret := nullif(current_setting('app.trial_identity_pepper', true), '');
  IF v_secret IS NOT NULL THEN
    RETURN v_secret;
  END IF;
  -- 2) DB-хранимый секрет (дефолт)
  SELECT value INTO v_secret FROM private.app_secrets WHERE key = 'trial_identity_pepper';
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'trial_identity_pepper_unconfigured';
  END IF;
  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.billing_identity_pepper() IS
  'Returns the server pepper for billing identity HMAC (GUC override, else '
  'private.app_secrets). Internal-only; no grants to anon/authenticated.';

REVOKE ALL ON FUNCTION public.billing_identity_pepper() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. billing_identity_hash(email) — псевдонимный ключ billing-owner identity.
--    HMAC-SHA256(lower(trim(email)), pepper). Плюс-алиасы НЕ срезаем (нет такой
--    продуктовой политики). STABLE (зависит от секрета в БД), не IMMUTABLE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_identity_hash(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT encode(
    extensions.hmac(lower(trim(p_email)), public.billing_identity_pepper(), 'sha256'),
    'hex'
  );
$$;

COMMENT ON FUNCTION public.billing_identity_hash(TEXT) IS
  'Keyed HMAC-SHA256 of canonical (lower+trim) email. Pseudonymous billing '
  'identity key — replaces the unsalted sha256 from 086. Raw email never stored.';

REVOKE ALL ON FUNCTION public.billing_identity_hash(TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. billing_identities — реестр псевдонимных billing-owner identity.
--    Одна строка на identity_hash. Сырой email НЕ хранится.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash TEXT NOT NULL UNIQUE,
  -- Первый пользователь, «представивший» identity (диагностика/поддержка).
  -- SET NULL: identity переживает удаление аккаунта — право на trial не
  -- возвращается пересозданием пользователя с тем же email.
  first_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_customer_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_identities_customer_id_key
  ON public.billing_identities (billing_customer_id)
  WHERE billing_customer_id IS NOT NULL;

COMMENT ON TABLE public.billing_identities IS
  'Pseudonymous billing owner identity registry (HMAC identity_hash). No raw '
  'email. Written only by SECURITY DEFINER billing functions.';

-- RLS: включена, политик НЕТ = полностью закрыта для прямого API-доступа.
-- Читается/пишется только SECURITY DEFINER функциями.
ALTER TABLE public.billing_identities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.billing_identities'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.billing_identities
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Расширяем billing_trial_claims: HMAC identity_hash + ссылка на реестр.
--    Существующие колонки (normalized_email_hash sha256) СОХРАНЯЮТСЯ.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_trial_claims
  ADD COLUMN IF NOT EXISTS identity_hash TEXT,
  ADD COLUMN IF NOT EXISTS identity_id   UUID REFERENCES public.billing_identities(id) ON DELETE SET NULL;

-- Backfill identity_hash из auth.users.email (pepper уже засеян выше, HMAC
-- вычислим). Только там, где ещё NULL и email известен.
UPDATE public.billing_trial_claims c
SET identity_hash = public.billing_identity_hash(u.email)
FROM auth.users u
WHERE u.id = c.user_id
  AND u.email IS NOT NULL
  AND c.identity_hash IS NULL;

-- Backfill реестра из существующих claim (одна identity на hash).
INSERT INTO public.billing_identities (identity_hash, first_user_id)
SELECT DISTINCT ON (c.identity_hash) c.identity_hash, c.user_id
FROM public.billing_trial_claims c
WHERE c.identity_hash IS NOT NULL
ORDER BY c.identity_hash, c.created_at ASC
ON CONFLICT (identity_hash) DO NOTHING;

-- Связываем claim → identity.
UPDATE public.billing_trial_claims c
SET identity_id = i.id
FROM public.billing_identities i
WHERE i.identity_hash = c.identity_hash
  AND c.identity_id IS NULL;

-- Констрейнты (catalog-guard, т.к. ADD CONSTRAINT не поддерживает IF NOT EXISTS).
-- UNIQUE(identity_hash): атомарный guard от повторного trial по HMAC-identity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_trial_claims_identity_hash_key'
      AND conrelid = 'public.billing_trial_claims'::regclass
  ) THEN
    ALTER TABLE public.billing_trial_claims
      ADD CONSTRAINT billing_trial_claims_identity_hash_key UNIQUE (identity_hash);
  END IF;
END $$;

-- UNIQUE(organization_id): «один trial claim на организацию» (spec). Частичный —
-- org_id nullable (claim переживает удаление организации).
CREATE UNIQUE INDEX IF NOT EXISTS billing_trial_claims_organization_id_key
  ON public.billing_trial_claims (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_trial_claims_identity_id_idx
  ON public.billing_trial_claims (identity_id);

-- ---------------------------------------------------------------------------
-- 6. init_trial_subscription(org, owner) — переопределяем: теперь пишем и
--    identity_hash (HMAC), и реестр billing_identities. Поведение/возврат
--    ('trial_granted' / 'trial_denied' / 'no_trial_plan') СОХРАНЯЮТСЯ, чтобы
--    create_organization() и тесты 086 не сломались. Dedup теперь защищён и
--    UNIQUE(identity_hash), и legacy UNIQUE(normalized_email_hash).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_trial_subscription(
  p_org_id   UUID,
  p_owner_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan_id     UUID;
  v_email       TEXT;
  v_sha_hash    TEXT;
  v_identity    TEXT;
  v_identity_id UUID;
  v_claim_id    UUID;
  v_trial_ends  TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN 'no_trial_plan'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_owner_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'owner_not_found'; END IF;

  v_sha_hash := public.normalized_email_hash(v_email);  -- back-compat (086)
  v_identity := public.billing_identity_hash(v_email);  -- HMAC identity (089)
  v_trial_ends := now() + INTERVAL '14 days';

  -- Реестр identity (идемпотентно).
  INSERT INTO public.billing_identities (identity_hash, first_user_id)
  VALUES (v_identity, p_owner_id)
  ON CONFLICT (identity_hash) DO NOTHING;
  SELECT id INTO v_identity_id FROM public.billing_identities WHERE identity_hash = v_identity;

  -- Атомарная попытка claim. Любой из UNIQUE (user_id / email_hash /
  -- identity_hash) при гонке оставит ровно один claim.
  BEGIN
    INSERT INTO public.billing_trial_claims (
      user_id, organization_id, normalized_email_hash, identity_hash, identity_id,
      status, trial_started_at, trial_ended_at
    ) VALUES (
      p_owner_id, p_org_id, v_sha_hash, v_identity, v_identity_id,
      'active', now(), v_trial_ends
    )
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    v_claim_id := NULL;
  END;

  IF v_claim_id IS NOT NULL THEN
    INSERT INTO public.billing_subscriptions (
      organization_id, plan_id, status, billing_cycle,
      trial_ends_at, current_period_start, current_period_end
    ) VALUES (
      p_org_id, v_plan_id, 'trialing', 'monthly',
      v_trial_ends, now(), v_trial_ends
    )
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.domain_events (
      organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
    ) VALUES (
      p_org_id, 'billing.trial.claimed', 'organization', p_org_id,
      jsonb_build_object(
        'organization_id', p_org_id, 'user_id', p_owner_id, 'plan', 'trial',
        'trial_started_at', now(), 'trial_ended_at', v_trial_ends
      ),
      p_owner_id
    );

    INSERT INTO public.audit_logs (
      organization_id, user_id, entity_type, entity_id, action, new_data, metadata
    ) VALUES (
      p_org_id, p_owner_id, 'billing_trial_claims', v_claim_id, 'billing_change',
      jsonb_build_object('status', 'active', 'trial_ended_at', v_trial_ends),
      jsonb_build_object('event', 'trial_claimed', 'source', 'create_organization')
    );

    RETURN 'trial_granted';
  END IF;

  -- Denied: identity уже использовала trial → expired/read-only подписка.
  INSERT INTO public.billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    trial_ends_at, current_period_start, current_period_end, metadata
  ) VALUES (
    p_org_id, v_plan_id, 'expired', 'monthly',
    now(), now(), now(), '{"trial_denied": true}'::jsonb
  )
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.domain_events (
    organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
  ) VALUES (
    p_org_id, 'billing.trial.denied', 'organization', p_org_id,
    jsonb_build_object(
      'organization_id', p_org_id, 'user_id', p_owner_id,
      'reason', 'billing_identity_already_used'
    ),
    p_owner_id
  );

  INSERT INTO public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action, new_data, metadata
  ) VALUES (
    p_org_id, p_owner_id, 'billing_subscriptions', p_org_id, 'billing_change',
    jsonb_build_object('status', 'expired', 'trial_denied', true),
    jsonb_build_object('event', 'trial_denied', 'source', 'create_organization')
  );

  RETURN 'trial_denied';
END;
$$;

COMMENT ON FUNCTION public.init_trial_subscription(UUID, UUID) IS
  'Claims the one-per-identity trial (HMAC billing_identities + '
  'billing_trial_claims) and provisions the subscription: trialing when '
  'granted, expired/read-only when the identity already used its trial. '
  'Internal-only; called from create_organization().';

REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. billing_owner_confirmed_email(uid) — подтверждённый email или NULL.
--    Trial привязывается к верифицированной billing-owner identity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_owner_confirmed_email(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
  SELECT u.email
  FROM auth.users u
  WHERE u.id = p_user_id
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.billing_owner_confirmed_email(UUID) IS
  'Confirmed email of a user, else NULL. Used to derive the verified billing '
  'identity for trial claims. Internal-only.';

REVOKE ALL ON FUNCTION public.billing_owner_confirmed_email(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_trial_eligibility_for_current_user() — типизированный контракт.
--    Identity ТОЛЬКО из auth.uid(); client payload не участвует.
--    reason ∈ {auth_required, developer_unlimited, verified_email_required,
--              trial_claimed, trial_already_used, never_used}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_eligibility_for_current_user()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_email    TEXT;
  v_identity TEXT;
  v_status   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'auth_required');
  END IF;

  -- Developer unlimited: trial не нужен (доступ и так безлимитный).
  IF public.is_account_unlimited(v_uid) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'developer_unlimited');
  END IF;

  v_email := public.billing_owner_confirmed_email(v_uid);
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'verified_email_required');
  END IF;

  -- Свой claim по user_id.
  SELECT status INTO v_status
  FROM public.billing_trial_claims
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_status = 'active' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_claimed');
  ELSIF v_status IN ('consumed', 'blocked') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_already_used');
  END IF;

  -- Тот же billing identity под другим аккаунтом (HMAC + legacy sha256).
  v_identity := public.billing_identity_hash(v_email);
  IF EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE identity_hash = v_identity
       OR normalized_email_hash = public.normalized_email_hash(v_email)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_already_used');
  END IF;

  RETURN jsonb_build_object('eligible', true, 'reason', 'never_used');
END;
$$;

COMMENT ON FUNCTION public.get_trial_eligibility_for_current_user() IS
  'Trial eligibility for the CURRENT user (auth.uid only). Typed reason codes. '
  'UX helper — real enforcement is the unique constraints + claim RPC.';

REVOKE ALL ON FUNCTION public.get_trial_eligibility_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_eligibility_for_current_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. claim_trial_for_current_user(org) — явный атомарный claim.
--    Пере-проверяет: auth → membership → can_manage_billing (owner) →
--    developer_unlimited → verified email → billing state. Логирует security-
--    событие (domain_events billing.*, без сырого email). Concurrency-safe:
--    полагается на UNIQUE(identity_hash / organization_id / user_id).
--    result: { ok, reason, access_state? }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_trial_for_current_user(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_email       TEXT;
  v_identity    TEXT;
  v_sha_hash    TEXT;
  v_identity_id UUID;
  v_plan_id     UUID;
  v_claim_id    UUID;
  v_trial_ends  TIMESTAMPTZ;
  v_cur_slug    TEXT;
  v_cur_status  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF p_organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'organization_required');
  END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'membership_required');
  END IF;
  -- billing.manage = owner-only (can_manage_billing из 002).
  IF NOT public.can_manage_billing(p_organization_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'permission_denied');
  END IF;
  IF public.is_account_unlimited(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'developer_unlimited',
                             'access_state', 'developer_unlimited');
  END IF;

  v_email := public.billing_owner_confirmed_email(v_uid);
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'verified_email_required');
  END IF;

  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
  END IF;

  -- Организация уже на активном платном плане → trial неуместен.
  SELECT p.slug, bs.status INTO v_cur_slug, v_cur_status
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id;

  IF v_cur_slug IS NOT NULL AND v_cur_slug <> 'trial' AND v_cur_status = 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing_state_invalid',
                             'access_state', 'paid_active');
  END IF;

  v_identity := public.billing_identity_hash(v_email);
  v_sha_hash := public.normalized_email_hash(v_email);
  v_trial_ends := now() + INTERVAL '14 days';

  -- Уже использован этой identity?
  IF EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE user_id = v_uid OR identity_hash = v_identity
       OR normalized_email_hash = v_sha_hash
  ) THEN
    -- Идемпотентность: активный claim этой же организации → уже в trial.
    IF EXISTS (
      SELECT 1 FROM public.billing_trial_claims
      WHERE identity_hash = v_identity
        AND organization_id = p_organization_id
        AND status = 'active'
    ) THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'trial_claimed',
                               'access_state', 'trialing');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'trial_already_used',
                             'access_state', 'requires_paid_plan');
  END IF;

  -- Реестр identity (идемпотентно).
  INSERT INTO public.billing_identities (identity_hash, first_user_id)
  VALUES (v_identity, v_uid)
  ON CONFLICT (identity_hash) DO NOTHING;
  SELECT id INTO v_identity_id FROM public.billing_identities WHERE identity_hash = v_identity;

  -- Атомарный claim. При гонке проигравшая транзакция ловит unique_violation.
  BEGIN
    INSERT INTO public.billing_trial_claims (
      user_id, organization_id, normalized_email_hash, identity_hash, identity_id,
      status, trial_started_at, trial_ended_at
    ) VALUES (
      v_uid, p_organization_id, v_sha_hash, v_identity, v_identity_id,
      'active', now(), v_trial_ends
    )
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'trial_already_used',
                             'access_state', 'requires_paid_plan');
  END;

  -- Провижининг trialing-подписки. Не трогаем чужой платный план: обновляем
  -- только trial-план (или создаём, если подписки нет).
  INSERT INTO public.billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    trial_ends_at, current_period_start, current_period_end
  ) VALUES (
    p_organization_id, v_plan_id, 'trialing', 'monthly',
    v_trial_ends, now(), v_trial_ends
  )
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.billing_subscriptions bs
  SET status = 'trialing',
      trial_ends_at = v_trial_ends,
      metadata = bs.metadata - 'trial_denied',
      updated_at = now()
  FROM public.plans p
  WHERE bs.plan_id = p.id
    AND p.slug = 'trial'
    AND bs.organization_id = p_organization_id
    AND bs.status <> 'trialing';

  -- Security event (activity_type='security' по имени billing.*, без email).
  INSERT INTO public.domain_events (
    organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
  ) VALUES (
    p_organization_id, 'billing.trial.claimed', 'organization', p_organization_id,
    jsonb_build_object(
      'organization_id', p_organization_id, 'user_id', v_uid, 'plan', 'trial',
      'source', 'claim_rpc', 'trial_started_at', now(), 'trial_ended_at', v_trial_ends
    ),
    v_uid
  );

  INSERT INTO public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action, new_data, metadata
  ) VALUES (
    p_organization_id, v_uid, 'billing_trial_claims', v_claim_id, 'billing_change',
    jsonb_build_object('status', 'active', 'trial_ended_at', v_trial_ends),
    jsonb_build_object('event', 'trial_claimed', 'source', 'claim_rpc')
  );

  RETURN jsonb_build_object('ok', true, 'reason', 'trial_claimed',
                           'access_state', 'trialing');
END;
$$;

COMMENT ON FUNCTION public.claim_trial_for_current_user(UUID) IS
  'Explicit atomic trial claim for the current owner. Re-checks membership + '
  'can_manage_billing, honours developer_unlimited, requires a confirmed email, '
  'and is race-safe via the unique constraints. Typed reason codes; logs a '
  'security event without raw email.';

REVOKE ALL ON FUNCTION public.claim_trial_for_current_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_trial_for_current_user(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. get_organization_access_state(org) — состояние доступа организации,
--     развёрнутое из billing_subscriptions (+ developer unlimited).
--     Возврат ∈ {no_org, developer_unlimited, security_hold, trialing,
--     trial_expired, paid_active, payment_past_due, payment_grace,
--     payment_unpaid, canceled, suspended, requires_paid_plan}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_access_state(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_slug      TEXT;
  v_status    TEXT;
  v_ends      TIMESTAMPTZ;
  v_meta      JSONB;
  v_pay_state TEXT;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL THEN
    RETURN 'no_org';
  END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RETURN 'no_org';
  END IF;
  IF public.is_account_unlimited(v_uid) THEN
    RETURN 'developer_unlimited';
  END IF;

  SELECT p.slug, bs.status, bs.trial_ends_at, bs.metadata
    INTO v_slug, v_status, v_ends, v_meta
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id;

  -- Legacy: организация без подписки остаётся writable (см. 027).
  IF v_slug IS NULL THEN
    RETURN 'paid_active';
  END IF;

  -- Ручные состояния через metadata (задел под провайдера/безопасность).
  IF COALESCE(v_meta ->> 'security_hold', 'false') = 'true' THEN
    RETURN 'security_hold';
  END IF;
  v_pay_state := v_meta ->> 'payment_state';
  IF v_pay_state IN ('payment_grace', 'payment_unpaid') THEN
    RETURN v_pay_state;
  END IF;

  IF v_slug = 'trial' THEN
    IF v_status = 'trialing' AND v_ends IS NOT NULL AND v_ends > now() THEN
      RETURN 'trialing';
    ELSIF COALESCE(v_meta ->> 'trial_denied', 'false') = 'true' THEN
      RETURN 'requires_paid_plan';
    ELSE
      RETURN 'trial_expired';
    END IF;
  END IF;

  RETURN CASE v_status
    WHEN 'active'    THEN 'paid_active'
    WHEN 'trialing'  THEN 'trialing'
    WHEN 'past_due'  THEN 'payment_past_due'
    WHEN 'canceled'  THEN 'canceled'
    WHEN 'paused'    THEN 'suspended'
    WHEN 'expired'   THEN 'requires_paid_plan'
    ELSE 'requires_paid_plan'
  END;
END;
$$;

COMMENT ON FUNCTION public.get_organization_access_state(UUID) IS
  'Typed access state for an org, derived from billing_subscriptions + '
  'developer unlimited. Membership-checked; no client payload.';

REVOKE ALL ON FUNCTION public.get_organization_access_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_access_state(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. can_write_org(org) — можно ли писать бизнес-данные СЕЙЧАС.
--     Композиция роли (can_write_data) + биллинг-состояния
--     (is_organization_writable) + developer unlimited. Дополняет 002/027.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_org(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL OR p_organization_id IS NULL THEN false
      WHEN public.is_account_unlimited(auth.uid()) AND public.is_org_member(p_organization_id) THEN true
      ELSE public.can_write_data(p_organization_id)
           AND public.is_organization_writable(p_organization_id)
    END;
$$;

COMMENT ON FUNCTION public.can_write_org(UUID) IS
  'True when the current user may write business data now: write role AND a '
  'writable billing state (developer unlimited always writes). Composes '
  'can_write_data (002) + is_organization_writable (027).';

REVOKE ALL ON FUNCTION public.can_write_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_org(UUID) TO authenticated;

COMMIT;
