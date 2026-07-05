import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Activity Log — a human-readable projection of the domain event log
 * (every create / update / delete across all modules), newest first.
 *
 * Reads public.domain_events directly (RLS: is_org_member). This is the visible
 * counterpart of the "Действия" sidebar counter, which counts UNSEEN events.
 */
export interface ActivityLogEntry {
  id: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  /** Best-effort human title pulled from the event payload. */
  title: string | null;
  actorId: string | null;
  createdAt: string;
}

export const ACTIVITY_LOG_LIMIT = 40;

function titleFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["title", "name", "provider_name", "summary", "detected_intent"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function getActivityLog(
  supabase: SupabaseClient,
  organizationId: string,
  limit: number = ACTIVITY_LOG_LIMIT,
): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("domain_events")
    .select("id, event_name, aggregate_type, aggregate_id, payload, created_by, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getActivityLog] failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventName: row.event_name as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    title: titleFromPayload(row.payload),
    actorId: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
