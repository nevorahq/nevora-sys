-- =============================================================================
-- Migration 010: Analytics Layer
-- analytics_snapshots, analytics_reports, analytics_widgets
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_snapshots — периодические снэпшоты метрик по организации
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id     UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  snapshot_date    DATE        NOT NULL,
  period_type      TEXT        NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),

  -- Tasks metrics
  tasks_total       INT         NOT NULL DEFAULT 0,
  tasks_active      INT         NOT NULL DEFAULT 0,
  tasks_completed   INT         NOT NULL DEFAULT 0,
  tasks_overdue     INT         NOT NULL DEFAULT 0,

  -- CRM metrics
  crm_clients_total   INT       NOT NULL DEFAULT 0,
  crm_clients_new     INT       NOT NULL DEFAULT 0,
  crm_deals_open      INT       NOT NULL DEFAULT 0,
  crm_deals_won       INT       NOT NULL DEFAULT 0,
  crm_deals_lost      INT       NOT NULL DEFAULT 0,
  crm_revenue_won     NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Documents metrics
  docs_total       INT         NOT NULL DEFAULT 0,
  docs_published   INT         NOT NULL DEFAULT 0,
  docs_drafts      INT         NOT NULL DEFAULT 0,

  -- Event activity
  events_total     INT         NOT NULL DEFAULT 0,

  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, snapshot_date, period_type)
);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view snapshots" ON analytics_snapshots;
CREATE POLICY "org members can view snapshots"
  ON analytics_snapshots FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can insert snapshots" ON analytics_snapshots;
CREATE POLICY "admins can insert snapshots"
  ON analytics_snapshots FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "admins can update snapshots" ON analytics_snapshots;
CREATE POLICY "admins can update snapshots"
  ON analytics_snapshots FOR UPDATE
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- analytics_widgets — настройки виджетов дашборда per-org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_widgets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id),
  name             TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  widget_type      TEXT        NOT NULL CHECK (widget_type IN (
    'kpi_card', 'line_chart', 'bar_chart', 'pie_chart',
    'activity_feed', 'leaderboard', 'funnel'
  )),
  data_source      TEXT        NOT NULL CHECK (data_source IN (
    'tasks', 'crm_deals', 'crm_clients', 'documents', 'domain_events', 'snapshots'
  )),
  config           JSONB       NOT NULL DEFAULT '{}',
  position         INT         NOT NULL DEFAULT 0,
  is_visible       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analytics_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view widgets" ON analytics_widgets;
CREATE POLICY "org members can view widgets"
  ON analytics_widgets FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can manage widgets" ON analytics_widgets;
CREATE POLICY "admins can manage widgets"
  ON analytics_widgets FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

DROP TRIGGER IF EXISTS handle_updated_at_analytics_widgets ON analytics_widgets;
CREATE TRIGGER handle_updated_at_analytics_widgets
  BEFORE UPDATE ON analytics_widgets
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- analytics_reports — сохранённые отчёты с параметрами
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id),
  name             TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      TEXT        CHECK (char_length(description) <= 1000),
  report_type      TEXT        NOT NULL CHECK (report_type IN (
    'tasks_summary', 'crm_pipeline', 'crm_revenue',
    'document_activity', 'team_activity', 'custom'
  )),
  parameters       JSONB       NOT NULL DEFAULT '{}',
  cached_result    JSONB,
  cached_at        TIMESTAMPTZ,
  is_scheduled     BOOLEAN     NOT NULL DEFAULT FALSE,
  schedule_cron    TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analytics_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view reports" ON analytics_reports;
CREATE POLICY "org members can view reports"
  ON analytics_reports FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "members can create reports" ON analytics_reports;
CREATE POLICY "members can create reports"
  ON analytics_reports FOR INSERT
  WITH CHECK (is_org_member(organization_id) AND auth.uid() = created_by);

DROP POLICY IF EXISTS "author or admin can update report" ON analytics_reports;
CREATE POLICY "author or admin can update report"
  ON analytics_reports FOR UPDATE
  USING (
    is_org_member(organization_id)
    AND (auth.uid() = created_by OR is_org_admin(organization_id))
    AND deleted_at IS NULL
  )
  WITH CHECK (
    is_org_member(organization_id)
    AND (auth.uid() = created_by OR is_org_admin(organization_id))
  );

DROP TRIGGER IF EXISTS handle_updated_at_analytics_reports ON analytics_reports;
CREATE TRIGGER handle_updated_at_analytics_reports
  BEFORE UPDATE ON analytics_reports
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_org_date
  ON analytics_snapshots (organization_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_period
  ON analytics_snapshots (organization_id, period_type, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_widgets_org
  ON analytics_widgets (organization_id, position);

CREATE INDEX IF NOT EXISTS idx_analytics_reports_org
  ON analytics_reports (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_org_name_date
  ON domain_events (organization_id, event_name, created_at DESC);
