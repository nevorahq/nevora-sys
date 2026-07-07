import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activityTypeForEvent, type ActivityType } from "./activity-classification";

/**
 * Activity Log — a human-readable projection of the domain event log
 * (every create / update / delete across all modules), newest first.
 *
 * Reads public.domain_events directly. RLS (migration 087) already scopes what
 * comes back per role: business for everyone, personal only to the actor,
 * security only to owner/admin, system never. The UI then groups by
 * activity_type into sections. This is the visible counterpart of the "Действия"
 * sidebar counter, which counts UNSEEN events under the same predicate.
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
  /** business | personal | security | system — drives the UI section grouping. */
  activityType: ActivityType;
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
    .select("id, event_name, aggregate_type, aggregate_id, payload, created_by, created_at, activity_type")
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
    // Prefer the DB column; fall back to the local classifier if it is absent.
    activityType:
      (row.activity_type as ActivityType | null) ?? activityTypeForEvent(row.event_name as string),
  }));
}
