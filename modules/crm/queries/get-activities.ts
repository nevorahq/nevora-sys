import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmActivity } from "../types/crm.types";
import type { ActivityType, CrmEntityType } from "../constants/crm.constants";

export interface GetActivitiesOptions {
  entityType?: CrmEntityType;
  entityId?: string;
  activityType?: ActivityType;
  completed?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getActivities(
  orgId: string,
  options: GetActivitiesOptions = {},
): Promise<CrmActivity[]> {
  const supabase = await createClient();

  let query = supabase
    .from("crm_activities")
    .select(
      "id, organization_id, entity_type, entity_id, activity_type, title, description, scheduled_at, completed, completed_at, created_by, created_at, updated_at",
    )
    .eq("organization_id", orgId);

  if (options.entityType) query = query.eq("entity_type", options.entityType);
  if (options.entityId) query = query.eq("entity_id", options.entityId);
  if (options.activityType) query = query.eq("activity_type", options.activityType);
  if (options.completed !== undefined) query = query.eq("completed", options.completed);
  if (options.search) query = query.ilike("title", `%${options.search}%`);
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("getActivities error:", error);
    return [];
  }
  return (data ?? []) as CrmActivity[];
}
