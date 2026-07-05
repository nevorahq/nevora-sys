"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";

/**
 * Stamp "the user has opened the Action Center now", which resets the
 * unseen-event badge on the "Действия" sidebar item. Best-effort: a failure just
 * leaves the badge as-is, never blocks the page.
 */
export async function markActionsSeenAction(): Promise<{ ok: boolean }> {
  const ctx = await requireOrg();
  if (!ctx.permissions.has("action_center.view")) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_action_center_seen", {
    p_organization_id: ctx.org.id,
  });
  if (error) {
    console.error("[markActionsSeenAction] failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
