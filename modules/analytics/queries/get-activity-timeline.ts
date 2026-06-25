import { createClient } from "@/lib/supabase/server";
import type { ActivityTimelinePoint } from "../types/analytics.types";
import { ANALYTICS_TIMELINE_DAYS } from "../constants/analytics.constants";

// Префиксы event_name для определения модуля
const MODULE_PREFIXES: Record<string, keyof ActivityTimelinePoint["byModule"]> = {
  "task.":     "tasks",
  "todo.":     "tasks",
  "deal.":     "crm",
  "client.":   "crm",
  "contact.":  "crm",
  "document.": "documents",
};

function resolveModule(eventName: string): keyof ActivityTimelinePoint["byModule"] {
  for (const [prefix, mod] of Object.entries(MODULE_PREFIXES)) {
    if (eventName.startsWith(prefix)) return mod;
  }
  return "other";
}

export async function getActivityTimeline(
  organizationId: string,
  days = ANALYTICS_TIMELINE_DAYS,
): Promise<ActivityTimelinePoint[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("domain_events")
    .select("event_name, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Build a map day → counts
  const map = new Map<string, ActivityTimelinePoint>();

  // Pre-fill all days (including days with 0 events)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    map.set(dateStr, {
      date:     dateStr,
      count:    0,
      byModule: { tasks: 0, crm: 0, documents: 0, other: 0 },
    });
  }

  for (const row of data) {
    const dateStr = row.created_at.slice(0, 10);
    const point = map.get(dateStr);
    if (!point) continue;
    point.count += 1;
    const mod = resolveModule(row.event_name);
    point.byModule[mod] += 1;
  }

  return Array.from(map.values());
}
