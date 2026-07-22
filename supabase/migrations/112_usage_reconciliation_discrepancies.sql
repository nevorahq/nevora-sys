-- Persistent audit log for usage-counter drift found by the usage-reconcile
-- sweep. The sweep already logs + alerts each discrepancy; this table keeps a
-- durable, queryable history (what drifted, by how much, whether it was
-- repaired) so drift can be audited over time rather than scraped from logs.
--
-- Internal ops table: written and read only by the service role (the sweep and
-- the ops diagnostic). RLS is enabled with NO policy, so authenticated/anon are
-- denied by default and the service role bypasses it. Append-only by design.

CREATE TABLE IF NOT EXISTS public.usage_reconciliation_discrepancies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  counter_key         TEXT        NOT NULL,
  counter_value       NUMERIC     NOT NULL,
  authoritative_value NUMERIC     NOT NULL,
  -- delta = counter_value - authoritative_value (positive = counter over-counts).
  delta               NUMERIC     NOT NULL,
  -- Whether this run repaired the counter (only when USAGE_RECONCILE_REPAIR is on).
  repaired            BOOLEAN     NOT NULL DEFAULT false,

  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usage_reconciliation_discrepancies IS
  'Append-only audit log of usage-counter drift found by the usage-reconcile sweep. Service-role only (RLS on, no policy).';

-- Ops queries: recent drift globally, and per-org history.
CREATE INDEX IF NOT EXISTS usage_reconciliation_discrepancies_detected_idx
  ON public.usage_reconciliation_discrepancies (detected_at DESC);
CREATE INDEX IF NOT EXISTS usage_reconciliation_discrepancies_org_detected_idx
  ON public.usage_reconciliation_discrepancies (organization_id, detected_at DESC);

-- Fail closed: RLS on with no policy denies anon/authenticated entirely; the
-- service role bypasses RLS. Belt-and-suspenders revoke of table privileges.
ALTER TABLE public.usage_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_reconciliation_discrepancies FROM PUBLIC, anon, authenticated;
