-- ============================================================
-- Migration 107: organization FX rates + cross-currency transfers
-- ============================================================
-- Keeps exchange_rates global/read-only and adds a tenant-scoped, versioned
-- manual-rate layer. Transfer amounts and the effective rate are snapshotted
-- on money_transactions so later rate changes never rewrite financial history.

BEGIN;

-- ── 1. Tenant-scoped exchange-rate history ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_exchange_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_currency    TEXT NOT NULL,
  quote_currency   TEXT NOT NULL,
  rate             NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
  effective_date   DATE NOT NULL,
  source           TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual', 'bank_api')),
  rate_kind        TEXT NOT NULL DEFAULT 'mid'
                     CHECK (rate_kind IN ('mid', 'buy', 'sell')),
  provider         TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_exchange_rates_distinct_currency_check
    CHECK (base_currency <> quote_currency),
  CONSTRAINT organization_exchange_rates_pair_date_kind_unique
    UNIQUE (organization_id, base_currency, quote_currency, effective_date, rate_kind)
);

COMMENT ON TABLE public.organization_exchange_rates IS
  'Tenant FX history using the organization base currency as pivot: '
  '1 base_currency = rate quote_currency. User writes are manual/admin-only; '
  'bank_api rows are reserved for a trusted service-role importer.';

CREATE INDEX IF NOT EXISTS organization_exchange_rates_lookup_idx
  ON public.organization_exchange_rates
    (organization_id, base_currency, quote_currency, rate_kind, effective_date DESC);

CREATE OR REPLACE FUNCTION public.normalize_organization_exchange_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_base TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.base_currency IS DISTINCT FROM OLD.base_currency
    OR NEW.quote_currency IS DISTINCT FROM OLD.quote_currency
    OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.rate_kind IS DISTINCT FROM OLD.rate_kind
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'exchange_rate_version_identity_is_immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW.base_currency := upper(trim(NEW.base_currency));
  NEW.quote_currency := upper(trim(NEW.quote_currency));
  NEW.provider := NULLIF(trim(NEW.provider), '');
  NEW.updated_at := now();

  SELECT upper(trim(base_currency)) INTO v_org_base
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_org_base IS NULL THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = '23503';
  END IF;
  IF NEW.base_currency <> v_org_base THEN
    RAISE EXCEPTION 'rate_base_currency_must_match_organization'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.source = 'manual' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.source = 'manual' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_organization_exchange_rate_trigger
  ON public.organization_exchange_rates;
CREATE TRIGGER normalize_organization_exchange_rate_trigger
  BEFORE INSERT OR UPDATE ON public.organization_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.normalize_organization_exchange_rate();

CREATE OR REPLACE FUNCTION public.audit_organization_exchange_rate_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- service-role bank imports have their own trusted operational boundary.
  -- User-authored manual changes are audited atomically with the row write.
  IF auth.uid() IS NULL OR NEW.source <> 'manual' THEN RETURN NULL; END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action,
    old_data, new_data, metadata
  ) VALUES (
    NEW.organization_id,
    auth.uid(),
    'organization_exchange_rates',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'rate', OLD.rate, 'effective_date', OLD.effective_date
    ) ELSE NULL END,
    jsonb_build_object(
      'rate', NEW.rate, 'effective_date', NEW.effective_date,
      'base_currency', NEW.base_currency, 'quote_currency', NEW.quote_currency,
      'source', NEW.source
    ),
    jsonb_build_object(
      'source', 'dashboard',
      'correction', TG_OP = 'UPDATE',
      'old_rate', CASE WHEN TG_OP = 'UPDATE' THEN OLD.rate ELSE NULL END,
      'new_rate', NEW.rate
    )
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_organization_exchange_rate_change_trigger
  ON public.organization_exchange_rates;
CREATE TRIGGER audit_organization_exchange_rate_change_trigger
  AFTER INSERT OR UPDATE ON public.organization_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.audit_organization_exchange_rate_change();

ALTER TABLE public.organization_exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_exchange_rates_select
  ON public.organization_exchange_rates;
CREATE POLICY organization_exchange_rates_select
  ON public.organization_exchange_rates FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_exchange_rates_insert_manual
  ON public.organization_exchange_rates;
CREATE POLICY organization_exchange_rates_insert_manual
  ON public.organization_exchange_rates FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
    AND source = 'manual'
    AND created_by = auth.uid()
    AND updated_by = auth.uid()
  );

DROP POLICY IF EXISTS organization_exchange_rates_update_manual
  ON public.organization_exchange_rates;
CREATE POLICY organization_exchange_rates_update_manual
  ON public.organization_exchange_rates FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
    AND source = 'manual'
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
    AND source = 'manual'
    AND updated_by = auth.uid()
  );

-- No authenticated DELETE policy: dated FX history is append-only except for
-- an explicit same-date correction (UPDATE, audited by the Server Action).
REVOKE ALL ON public.organization_exchange_rates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.organization_exchange_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_exchange_rates TO service_role;

-- ── 2. Unified organization/global resolver ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_resolve_organization_exchange_rate(
  p_organization_id UUID,
  p_from_currency   TEXT,
  p_to_currency     TEXT,
  p_on_date         DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  rate              NUMERIC,
  source            TEXT,
  effective_date    DATE,
  provider          TEXT,
  rate_kind         TEXT,
  is_stale          BOOLEAN,
  exchange_rate_id  UUID
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_from TEXT := upper(trim(p_from_currency));
  v_to TEXT := upper(trim(p_to_currency));
  v_base TEXT;

  v_from_rate NUMERIC := 1;
  v_to_rate NUMERIC := 1;
  v_from_source TEXT := 'same_currency';
  v_to_source TEXT := 'same_currency';
  v_from_date DATE := p_on_date;
  v_to_date DATE := p_on_date;
  v_from_provider TEXT;
  v_to_provider TEXT;
  v_from_id UUID;
  v_to_id UUID;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_from = v_to THEN
    RETURN QUERY SELECT 1::NUMERIC, 'same_currency'::TEXT, p_on_date,
      NULL::TEXT, 'mid'::TEXT, false, NULL::UUID;
    RETURN;
  END IF;

  SELECT upper(trim(o.base_currency)) INTO v_base
  FROM public.organizations o
  WHERE o.id = p_organization_id;
  IF v_base IS NULL THEN RETURN; END IF;

  IF v_from <> v_base THEN
    SELECT r.rate, r.source, r.effective_date, r.provider, r.id
      INTO v_from_rate, v_from_source, v_from_date, v_from_provider, v_from_id
    FROM public.organization_exchange_rates r
    WHERE r.organization_id = p_organization_id
      AND r.base_currency = v_base
      AND r.quote_currency = v_from
      AND r.rate_kind = 'mid'
      AND r.effective_date <= p_on_date
    ORDER BY CASE r.source WHEN 'manual' THEN 0 ELSE 1 END,
      r.effective_date DESC, r.created_at DESC
    LIMIT 1;

    IF v_from_rate IS NULL THEN
      v_from_rate := public.fn_get_exchange_rate(v_base, v_from, p_on_date);
      IF v_from_rate IS NOT NULL THEN
        v_from_source := 'global';
        SELECT LEAST(
          CASE WHEN v_base = 'EUR' THEN p_on_date ELSE (
            SELECT max(er.as_of_date) FROM public.exchange_rates er
            WHERE er.quote_currency = v_base AND er.as_of_date <= p_on_date
          ) END,
          CASE WHEN v_from = 'EUR' THEN p_on_date ELSE (
            SELECT max(er.as_of_date) FROM public.exchange_rates er
            WHERE er.quote_currency = v_from AND er.as_of_date <= p_on_date
          ) END
        ) INTO v_from_date;
      END IF;
    END IF;
  END IF;

  IF v_to <> v_base THEN
    SELECT r.rate, r.source, r.effective_date, r.provider, r.id
      INTO v_to_rate, v_to_source, v_to_date, v_to_provider, v_to_id
    FROM public.organization_exchange_rates r
    WHERE r.organization_id = p_organization_id
      AND r.base_currency = v_base
      AND r.quote_currency = v_to
      AND r.rate_kind = 'mid'
      AND r.effective_date <= p_on_date
    ORDER BY CASE r.source WHEN 'manual' THEN 0 ELSE 1 END,
      r.effective_date DESC, r.created_at DESC
    LIMIT 1;

    IF v_to_rate IS NULL THEN
      v_to_rate := public.fn_get_exchange_rate(v_base, v_to, p_on_date);
      IF v_to_rate IS NOT NULL THEN
        v_to_source := 'global';
        SELECT LEAST(
          CASE WHEN v_base = 'EUR' THEN p_on_date ELSE (
            SELECT max(er.as_of_date) FROM public.exchange_rates er
            WHERE er.quote_currency = v_base AND er.as_of_date <= p_on_date
          ) END,
          CASE WHEN v_to = 'EUR' THEN p_on_date ELSE (
            SELECT max(er.as_of_date) FROM public.exchange_rates er
            WHERE er.quote_currency = v_to AND er.as_of_date <= p_on_date
          ) END
        ) INTO v_to_date;
      END IF;
    END IF;
  END IF;

  IF v_from_rate IS NULL OR v_to_rate IS NULL THEN RETURN; END IF;

  rate := v_to_rate / v_from_rate;
  source := CASE
    WHEN v_from_source = 'manual' OR v_to_source = 'manual' THEN 'manual'
    WHEN v_from_source = 'bank_api' OR v_to_source = 'bank_api' THEN 'bank_api'
    ELSE 'global'
  END;
  effective_date := LEAST(v_from_date, v_to_date);
  provider := CASE
    WHEN v_from_provider IS NOT NULL AND v_to_provider IS NOT NULL
      AND v_from_provider = v_to_provider THEN v_from_provider
    WHEN v_from_provider IS NOT NULL AND v_to = v_base THEN v_from_provider
    WHEN v_to_provider IS NOT NULL AND v_from = v_base THEN v_to_provider
    ELSE NULL
  END;
  rate_kind := 'mid';
  is_stale := effective_date IS NULL OR effective_date < (p_on_date - 30);
  -- A single FK can identify a direct base-currency leg. Composite cross-rates
  -- intentionally leave it NULL rather than misrepresenting one of two legs.
  exchange_rate_id := CASE
    WHEN v_from_id IS NOT NULL AND v_to = v_base THEN v_from_id
    WHEN v_to_id IS NOT NULL AND v_from = v_base THEN v_to_id
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_resolve_organization_exchange_rate(UUID, TEXT, TEXT, DATE) IS
  'Units of p_to_currency per 1 p_from_currency. Priority per base-pivot leg: '
  'organization manual, organization bank_api, then global exchange_rates. '
  'Returns no row when unresolved and never fabricates a 1:1 cross-rate.';

REVOKE ALL ON FUNCTION public.fn_resolve_organization_exchange_rate(UUID, TEXT, TEXT, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_organization_exchange_rate(UUID, TEXT, TEXT, DATE)
  TO authenticated;

-- ── 3. Immutable transfer snapshot ─────────────────────────────────────────

ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS destination_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS destination_currency TEXT,
  ADD COLUMN IF NOT EXISTS reference_exchange_rate NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS effective_exchange_rate NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_id UUID
    REFERENCES public.organization_exchange_rates(id) ON DELETE RESTRICT;

UPDATE public.money_transactions
SET destination_amount = amount,
    destination_currency = currency,
    reference_exchange_rate = 1,
    effective_exchange_rate = 1,
    exchange_rate_source = NULL,
    exchange_rate_id = NULL
WHERE type = 'transfer'
  AND destination_amount IS NULL;

UPDATE public.money_transactions
SET category_id = NULL,
    category_source = NULL,
    category_confidence = NULL,
    categorization_status = 'uncategorized'
WHERE type = 'transfer'
  AND (category_id IS NOT NULL
    OR category_source IS NOT NULL
    OR category_confidence IS NOT NULL
    OR categorization_status <> 'uncategorized');

ALTER TABLE public.money_transactions
  DROP CONSTRAINT IF EXISTS money_transactions_transfer_accounts_check,
  DROP CONSTRAINT IF EXISTS money_transactions_transfer_snapshot_check,
  DROP CONSTRAINT IF EXISTS money_transactions_exchange_rate_source_check;

ALTER TABLE public.money_transactions
  ADD CONSTRAINT money_transactions_exchange_rate_source_check
    CHECK (exchange_rate_source IS NULL OR exchange_rate_source IN ('manual', 'bank_api', 'global', 'custom')),
  ADD CONSTRAINT money_transactions_transfer_snapshot_check
    CHECK (
      (
        type = 'transfer'
        AND from_account_id IS NOT NULL
        AND to_account_id IS NOT NULL
        AND from_account_id <> to_account_id
        AND destination_amount IS NOT NULL AND destination_amount > 0
        AND destination_currency IS NOT NULL
        AND effective_exchange_rate IS NOT NULL AND effective_exchange_rate > 0
        AND (
          (currency = destination_currency
            AND amount = destination_amount
            AND reference_exchange_rate = 1
            AND effective_exchange_rate = 1
            AND exchange_rate_source IS NULL
            AND exchange_rate_id IS NULL)
          OR
          (currency <> destination_currency
            AND exchange_rate_source IS NOT NULL
            AND (reference_exchange_rate IS NULL OR reference_exchange_rate > 0))
        )
      )
      OR
      (
        type <> 'transfer'
        AND from_account_id IS NULL
        AND to_account_id IS NULL
        AND destination_amount IS NULL
        AND destination_currency IS NULL
        AND reference_exchange_rate IS NULL
        AND effective_exchange_rate IS NULL
        AND exchange_rate_source IS NULL
        AND exchange_rate_id IS NULL
      )
    );

CREATE OR REPLACE FUNCTION public.validate_money_transfer_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_from public.money_accounts%ROWTYPE;
  v_to public.money_accounts%ROWTYPE;
  v_rate_org UUID;
  v_rate_source TEXT;
  v_rate_date DATE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.type = 'transfer' AND OLD.status = 'posted' AND (
    NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.destination_amount IS DISTINCT FROM OLD.destination_amount
    OR NEW.destination_currency IS DISTINCT FROM OLD.destination_currency
    OR NEW.reference_exchange_rate IS DISTINCT FROM OLD.reference_exchange_rate
    OR NEW.effective_exchange_rate IS DISTINCT FROM OLD.effective_exchange_rate
    OR NEW.exchange_rate_source IS DISTINCT FROM OLD.exchange_rate_source
    OR NEW.exchange_rate_id IS DISTINCT FROM OLD.exchange_rate_id
    OR NEW.from_account_id IS DISTINCT FROM OLD.from_account_id
    OR NEW.to_account_id IS DISTINCT FROM OLD.to_account_id
  ) THEN
    RAISE EXCEPTION 'posted_transfer_snapshot_is_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.type <> 'transfer' THEN RETURN NEW; END IF;

  IF NEW.category_id IS NOT NULL
     OR NEW.category_source IS NOT NULL
     OR NEW.category_confidence IS NOT NULL
     OR NEW.categorization_status <> 'uncategorized' THEN
    RAISE EXCEPTION 'transfer_cannot_be_categorized' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_from FROM public.money_accounts WHERE id = NEW.from_account_id;
  SELECT * INTO v_to FROM public.money_accounts WHERE id = NEW.to_account_id;

  IF v_from.id IS NULL OR v_to.id IS NULL THEN
    RAISE EXCEPTION 'transfer_account_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_from.organization_id <> NEW.organization_id
     OR v_to.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'transfer_account_organization_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NOT v_from.is_active OR v_from.deleted_at IS NOT NULL
     OR NOT v_to.is_active OR v_to.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'transfer_account_inactive' USING ERRCODE = '23514';
  END IF;
  IF NEW.account_id <> NEW.from_account_id THEN
    RAISE EXCEPTION 'transfer_account_id_must_match_source' USING ERRCODE = '23514';
  END IF;
  IF upper(trim(NEW.currency)) <> upper(trim(v_from.currency))
     OR upper(trim(NEW.destination_currency)) <> upper(trim(v_to.currency)) THEN
    RAISE EXCEPTION 'transfer_currency_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.effective_exchange_rate <> round(NEW.destination_amount / NEW.amount, 10) THEN
    RAISE EXCEPTION 'transfer_effective_rate_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NEW.exchange_rate_id IS NOT NULL THEN
    SELECT organization_id, source, effective_date
      INTO v_rate_org, v_rate_source, v_rate_date
    FROM public.organization_exchange_rates
    WHERE id = NEW.exchange_rate_id;
    IF v_rate_org IS DISTINCT FROM NEW.organization_id
       OR v_rate_source IS DISTINCT FROM NEW.exchange_rate_source
       OR v_rate_date > NEW.transaction_date THEN
      RAISE EXCEPTION 'transfer_exchange_rate_organization_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_money_transfer_snapshot_trigger
  ON public.money_transactions;
CREATE TRIGGER validate_money_transfer_snapshot_trigger
  BEFORE INSERT OR UPDATE ON public.money_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_money_transfer_snapshot();

-- ── 4. Authoritative transfer creation RPC ────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_money_transfer(
  p_organization_id  UUID,
  p_workspace_id     UUID,
  p_from_account_id  UUID,
  p_to_account_id    UUID,
  p_source_amount    NUMERIC,
  p_destination_amount NUMERIC DEFAULT NULL,
  p_transaction_date DATE DEFAULT CURRENT_DATE,
  p_note             TEXT DEFAULT NULL
)
RETURNS TABLE(
  id                       UUID,
  source_amount            NUMERIC,
  source_currency          TEXT,
  destination_amount       NUMERIC,
  destination_currency     TEXT,
  reference_exchange_rate  NUMERIC,
  effective_exchange_rate  NUMERIC,
  exchange_rate_source     TEXT,
  exchange_rate_id         UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_from public.money_accounts%ROWTYPE;
  v_to public.money_accounts%ROWTYPE;
  v_resolved_rate NUMERIC;
  v_resolved_source TEXT;
  v_resolved_id UUID;
  v_source_amount NUMERIC(14, 2);
  v_destination_amount NUMERIC(14, 2);
  v_reference_rate NUMERIC(20, 10);
  v_effective_rate NUMERIC(20, 10);
  v_rate_source TEXT;
  v_rate_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_data(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_from_account_id = p_to_account_id OR p_source_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_transfer' USING ERRCODE = '22023';
  END IF;

  SELECT source_account.* INTO v_from
  FROM public.money_accounts AS source_account
  WHERE source_account.id = p_from_account_id
    AND source_account.organization_id = p_organization_id
    AND source_account.is_active = true
    AND source_account.deleted_at IS NULL;
  SELECT destination_account.* INTO v_to
  FROM public.money_accounts AS destination_account
  WHERE destination_account.id = p_to_account_id
    AND destination_account.organization_id = p_organization_id
    AND destination_account.is_active = true
    AND destination_account.deleted_at IS NULL;
  IF v_from.id IS NULL OR v_to.id IS NULL THEN
    RAISE EXCEPTION 'transfer_account_not_available' USING ERRCODE = '23514';
  END IF;

  v_source_amount := round(p_source_amount, 2);
  IF upper(v_from.currency) = upper(v_to.currency) THEN
    v_destination_amount := v_source_amount;
    v_reference_rate := 1;
    v_effective_rate := 1;
    v_rate_source := NULL;
    v_rate_id := NULL;
  ELSE
    SELECT r.rate, r.source, r.exchange_rate_id
      INTO v_resolved_rate, v_resolved_source, v_resolved_id
    FROM public.fn_resolve_organization_exchange_rate(
      p_organization_id, v_from.currency, v_to.currency, p_transaction_date
    ) r;

    IF v_resolved_rate IS NULL AND p_destination_amount IS NULL THEN
      RAISE EXCEPTION 'missing_exchange_rate' USING ERRCODE = '22023';
    END IF;

    v_reference_rate := v_resolved_rate;
    v_destination_amount := round(
      COALESCE(p_destination_amount, v_source_amount * v_resolved_rate), 2
    );
    IF v_destination_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_destination_amount' USING ERRCODE = '22023';
    END IF;
    v_effective_rate := round(v_destination_amount / v_source_amount, 10);
    v_rate_source := COALESCE(v_resolved_source, 'custom');
    v_rate_id := v_resolved_id;
  END IF;

  RETURN QUERY
  INSERT INTO public.money_transactions (
    organization_id, workspace_id, created_by, updated_by,
    account_id, from_account_id, to_account_id, category_id, type,
    amount, currency, destination_amount, destination_currency,
    reference_exchange_rate, effective_exchange_rate,
    exchange_rate_source, exchange_rate_id,
    transaction_date, title, note, status
  ) VALUES (
    p_organization_id, p_workspace_id, auth.uid(), auth.uid(),
    v_from.id, v_from.id, v_to.id, NULL, 'transfer',
    v_source_amount, upper(v_from.currency), v_destination_amount, upper(v_to.currency),
    v_reference_rate, v_effective_rate, v_rate_source, v_rate_id,
    p_transaction_date, v_from.name || ' → ' || v_to.name, NULLIF(trim(p_note), ''), 'posted'
  )
  RETURNING money_transactions.id, money_transactions.amount,
    money_transactions.currency, money_transactions.destination_amount,
    money_transactions.destination_currency,
    money_transactions.reference_exchange_rate,
    money_transactions.effective_exchange_rate,
    money_transactions.exchange_rate_source,
    money_transactions.exchange_rate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_money_transfer(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_money_transfer(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, DATE, TEXT)
  TO authenticated;

COMMIT;
