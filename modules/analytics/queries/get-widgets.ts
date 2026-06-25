import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AnalyticsWidget } from "../types/analytics.types";

export async function getWidgets(orgId: string): Promise<AnalyticsWidget[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("analytics_widgets")
    .select("*")
    .eq("organization_id", orgId)
    .order("position", { ascending: true });

  if (error) {
    console.error("getWidgets error:", error);
    return [];
  }

  return (data ?? []) as AnalyticsWidget[];
}
