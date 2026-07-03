-- Notification delivery: preferences, realtime metadata, Web Push subscriptions,
-- and channel idempotency. Extends the Action Center notification model from 048.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'action_center'
    CHECK (category IN ('task', 'subscription', 'payment', 'document', 'action_center')),
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS target_url TEXT,
  ADD COLUMN IF NOT EXISTS deduplication_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_delivery_dedupe_idx
  ON public.notifications (organization_id, user_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browser_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  in_app_sound_enabled BOOLEAN NOT NULL DEFAULT false,
  sound_mode TEXT NOT NULL DEFAULT 'important'
    CHECK (sound_mode IN ('all', 'important', 'off')),
  sound_volume NUMERIC(3, 2) NOT NULL DEFAULT 0.70
    CHECK (sound_volume >= 0 AND sound_volume <= 1),
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME NOT NULL DEFAULT '22:00',
  quiet_hours_end TIME NOT NULL DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  task_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  subscription_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  payment_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  document_review_enabled BOOLEAN NOT NULL DEFAULT true,
  action_center_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_recipient_idx
  ON public.push_subscriptions (organization_id, user_id);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.touch_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON public.user_notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_preferences_updated_at();

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

CREATE POLICY "notification_preferences_select_own"
  ON public.user_notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "notification_preferences_insert_own"
  ON public.user_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "notification_preferences_update_own"
  ON public.user_notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

-- Browser clients never receive a list of endpoint/key material. Authenticated
-- users may only create/update/delete their own active-organization rows through
-- the server boundary, where identity and tenancy are derived from requireOrg().
CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "push_subscriptions_update_own"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

CREATE POLICY "notification_deliveries_select_own"
  ON public.notification_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "notification_deliveries_insert_own"
  ON public.notification_deliveries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
REVOKE ALL ON public.push_subscriptions FROM authenticated, anon;
GRANT SELECT, INSERT ON public.notification_deliveries TO authenticated;

-- Safe to run whether or not notifications was previously added to Realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
