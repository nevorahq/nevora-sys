import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface PendingAccountDeletion {
  id: string;
  requestedAt: string;
  purgeAfter: string;
}

/**
 * The current user's pending deletion request, if any. Drives both the profile
 * "Danger zone" section and the dashboard-wide reactivation banner. Returns null
 * for the common case (no request) and degrades to null on any read error —
 * the banner simply does not show rather than breaking the dashboard.
 */
export async function getPendingAccountDeletion(): Promise<PendingAccountDeletion | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("id, requested_at, purge_after")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    requestedAt: data.requested_at as string,
    purgeAfter: data.purge_after as string,
  };
}
