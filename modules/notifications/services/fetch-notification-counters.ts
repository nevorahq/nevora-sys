import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeNotificationCounters } from "../counters";
import type { NotificationCounters } from "../types";

export async function fetchNotificationCounters(supabase: SupabaseClient, organizationId: string): Promise<NotificationCounters | null> {
  const { data, error } = await supabase.rpc("get_notification_counters", { p_organization_id: organizationId });
  return error ? null : normalizeNotificationCounters(data);
}
