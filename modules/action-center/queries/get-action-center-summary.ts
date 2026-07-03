import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import type { ActionSummary } from "../types/action-center.types";
import { normalizeNotificationCounters } from "@/modules/notifications/counters";

const ACTIVE = ["open", "in_progress", "snoozed"];

/**
 * Summary Strip: критичные / due today / ожидают подтверждения / AI suggestions.
 * Только count'ы (head:true) — без выборки строк, без select("*").
 */
export async function getActionCenterSummary(): Promise<ActionSummary> {
  const empty: ActionSummary = { critical: 0, dueToday: 0, upcoming: 0, overdue: 0, snoozed: 0, recentlyResolved: 0, waitingApproval: 0, aiSuggestions: 0, total: 0 };

  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) return empty;

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const base = () =>
    supabase.from("action_items").select("id", { count: "exact", head: true }).eq("organization_id", orgId);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [counterResult, waiting, ai, snoozed, recentlyResolved] = await Promise.all([
    supabase.rpc("get_notification_counters", { p_organization_id: orgId }),
    base().in("status", ACTIVE).in("type", ["approval_required", "draft_review", "document_review"]),
    base().in("status", ACTIVE).eq("type", "ai_suggestion"),
    base().eq("status", "snoozed"),
    base().in("status", ["resolved", "dismissed"]).gte("updated_at", since),
  ]);
  const counters = counterResult.error ? null : normalizeNotificationCounters(counterResult.data);

  return {
    total: counters?.attention ?? 0,
    critical: counters?.urgent ?? 0,
    dueToday: counters?.dueToday ?? 0,
    upcoming: counters?.upcoming ?? 0,
    overdue: counters?.overdue ?? 0,
    snoozed: snoozed.count ?? 0,
    recentlyResolved: recentlyResolved.count ?? 0,
    waitingApproval: waiting.count ?? 0,
    aiSuggestions: ai.count ?? 0,
  };
}
