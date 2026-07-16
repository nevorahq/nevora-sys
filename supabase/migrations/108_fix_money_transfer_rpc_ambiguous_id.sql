-- Fix create_money_transfer runtime error 42702:
-- RETURNS TABLE exposes an output variable named `id`, so unqualified
-- `WHERE id = ...` references inside PL/pgSQL are ambiguous. This migration is
-- intentionally limited to replacing the RPC with qualified account aliases.

BEGIN;

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
    ) AS r;

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
