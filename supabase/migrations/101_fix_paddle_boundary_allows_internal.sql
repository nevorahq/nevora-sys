-- =============================================================================
-- Migration 101: Fix paddle-only boundary that broke organization creation
--
-- Regression introduced by migration 100 (paddle-only billing boundary):
--
--   ALTER TABLE public.billing_subscriptions
--     ADD CONSTRAINT billing_subscriptions_billing_provider_paddle_check
--     CHECK (billing_provider IS NULL OR billing_provider = 'paddle') NOT VALID;
--
-- But billing_subscriptions.billing_provider is NOT NULL DEFAULT 'manual'
-- (migration 071). Internal trial/free provisioning
-- (init_trial_subscription / init_free_subscription) inserts a subscription
-- WITHOUT setting billing_provider, so the column takes its 'manual' default,
-- which the new check rejects. Because create_organization() provisions the
-- trial subscription inside the same SECURITY DEFINER transaction as the org,
-- membership and workspace, the check violation (SQLSTATE 23514) rolls the
-- whole thing back. The onboarding Server Action sees a non-unique DB error
-- and returns "Не удалось создать организацию. Попробуйте ещё раз."
-- (dict.onboarding.errors.createFailed). Result: NO new organization can be
-- created.
--
-- 'manual' is the internal, no-external-processor marker established in 071 —
-- it is NOT a competing payment provider. The paddle-only boundary is meant to
-- forbid OTHER external providers (e.g. a re-introduced 'stripe') for
-- provider-managed rows, while still allowing internal trial/free
-- subscriptions. So the fix is to widen the boundary to permit the internal
-- 'manual' marker alongside 'paddle'.
--
-- Existing data: all current billing_subscriptions rows are 'manual', so this
-- constraint is added VALIDATED (no NOT VALID) — it both re-validates history
-- and enforces going forward.
--
-- The sibling checks on billing_provider_mappings and billing_provider_events
-- (also from 100) are intentionally left paddle-only: those tables are written
-- exclusively by the Paddle webhook path (apply_billing_provider_event) and
-- never carry internal/manual rows.
-- =============================================================================

BEGIN;

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_billing_provider_paddle_check;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_billing_provider_paddle_check
  CHECK (billing_provider IS NULL OR billing_provider IN ('manual', 'paddle'));

COMMENT ON CONSTRAINT billing_subscriptions_billing_provider_paddle_check
  ON public.billing_subscriptions IS
  'Paddle-only boundary for external providers: internal subscriptions use '
  '''manual'' (071 default) or NULL; the only permitted external provider is '
  '''paddle''. Widened from the 100 definition, which rejected the ''manual'' '
  'default and blocked create_organization().';

COMMIT;
