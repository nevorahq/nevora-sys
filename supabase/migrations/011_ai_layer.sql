-- =============================================================================
-- Migration 011: AI Layer
-- ai_summaries, ai_insights, ai_recommendations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ai_summaries — AI-сгенерированные саммари конкретных сущностей
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_summaries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type      TEXT        NOT NULL CHECK (entity_type IN (
    'task', 'deal', 'client', 'document', 'pipeline', 'org'
  )),
  entity_id        UUID        NOT NULL,
  summary          TEXT        NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 5000),
  model            TEXT        NOT NULL,
  prompt_tokens    INT,
  completion_tokens INT,
  version          INT         NOT NULL DEFAULT 1,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}',

  UNIQUE (organization_id, entity_type, entity_id)
);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view summaries" ON ai_summaries;
CREATE POLICY "org members can view summaries"
  ON ai_summaries FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can insert summaries" ON ai_summaries;
CREATE POLICY "org members can insert summaries"
  ON ai_summaries FOR INSERT
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can update summaries" ON ai_summaries;
CREATE POLICY "org members can update summaries"
  ON ai_summaries FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- ai_insights — периодические инсайты по метрикам организации
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_insights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  insight_type     TEXT        NOT NULL CHECK (insight_type IN (
    'trend', 'anomaly', 'forecast', 'comparison', 'recommendation_summary'
  )),
  module           TEXT        NOT NULL CHECK (module IN (
    'tasks', 'crm', 'documents', 'analytics', 'overall'
  )),
  title            TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body             TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  severity         TEXT        NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'success', 'critical')),
  data_snapshot    JSONB       NOT NULL DEFAULT '{}',
  model            TEXT        NOT NULL,
  is_read          BOOLEAN     NOT NULL DEFAULT FALSE,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}'
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view insights" ON ai_insights;
CREATE POLICY "org members can view insights"
  ON ai_insights FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can insert insights" ON ai_insights;
CREATE POLICY "org members can insert insights"
  ON ai_insights FOR INSERT
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can update insights" ON ai_insights;
CREATE POLICY "org members can update insights"
  ON ai_insights FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- ai_recommendations — рекомендуемые действия
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description      TEXT        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  action_type      TEXT        NOT NULL CHECK (action_type IN (
    'follow_up', 'close_deal', 'reassign_task', 'update_document',
    'contact_client', 'review_pipeline', 'custom'
  )),
  priority         TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  entity_type      TEXT        CHECK (entity_type IN ('task', 'deal', 'client', 'document')),
  entity_id        UUID,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'done')),
  model            TEXT        NOT NULL,
  due_date         DATE,
  dismissed_at     TIMESTAMPTZ,
  dismissed_by     UUID        REFERENCES auth.users(id),
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}',

  CONSTRAINT entity_link_consistent CHECK (
    (entity_type IS NULL AND entity_id IS NULL) OR
    (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view recommendations" ON ai_recommendations;
CREATE POLICY "org members can view recommendations"
  ON ai_recommendations FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can insert recommendations" ON ai_recommendations;
CREATE POLICY "org members can insert recommendations"
  ON ai_recommendations FOR INSERT
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "org members can update recommendations" ON ai_recommendations;
CREATE POLICY "org members can update recommendations"
  ON ai_recommendations FOR UPDATE
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_summaries_entity
  ON ai_summaries (organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_org_module
  ON ai_insights (organization_id, module, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_org_status
  ON ai_recommendations (organization_id, status, priority)
  WHERE status = 'pending';
