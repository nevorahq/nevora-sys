import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import type { ActionSummary } from "../types/action-center.types";

const ACTIVE = ["open", "in_progress", "snoozed"];

/**
 * Summary Strip: критичные / due today / ожидают подтверждения / AI suggestions.
 * Только count'ы (head:true) — без выборки строк, без select("*").
 */
export async function getActionCenterSummary(): Promise<ActionSummary> {
  const empty: ActionSummary = { critical: 0, dueToday: 0, waitingApproval: 0, aiSuggestions: 0, total: 0 };

  const ctx = await requireOrg();
  if (!canDo(ctx, "action_center.view")) return empty;

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

  const base = () =>
    supabase.from("action_items").select("id", { count: "exact", head: true }).eq("organization_id", orgId);

  const [total, critical, dueToday, waiting, ai] = await Promise.all([
    base().in("status", ACTIVE),
    base().in("status", ACTIVE).eq("priority", "critical"),
    base().in("status", ACTIVE).gte("due_at", startOfDay.toISOString()).lte("due_at", endOfDay.toISOString()),
    base().in("status", ACTIVE).in("type", ["approval_required", "draft_review", "document_review"]),
    base().in("status", ACTIVE).eq("type", "ai_suggestion"),
  ]);

  return {
    total: total.count ?? 0,
    critical: critical.count ?? 0,
    dueToday: dueToday.count ?? 0,
    waitingApproval: waiting.count ?? 0,
    aiSuggestions: ai.count ?? 0,
  };
}
