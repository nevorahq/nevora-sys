import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  commercialUsageMetricKeySchema,
  type CommercialUsageMetricKey,
} from "../plan-catalog.schema";
import { usageMetricToLimitKey } from "../plan-catalog";
import { assertPlanLimit, getUsage } from "./billing-service";

async function organizationIdForWorkspace(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();

  return typeof data?.organization_id === "string" ? data.organization_id : null;
}

export const usageService = {
  async getUsage(workspaceId: string, metricKey: CommercialUsageMetricKey) {
    const parsed = commercialUsageMetricKeySchema.safeParse(metricKey);
    if (!parsed.success) return { metricKey, value: 0 };

    const organizationId = await organizationIdForWorkspace(workspaceId);
    if (!organizationId) return { metricKey, value: 0 };

    const usage = await getUsage(organizationId, usageMetricToLimitKey[parsed.data]);
    return { metricKey: parsed.data, value: usage.value };
  },

  async assertWithinLimit(
    workspaceId: string,
    metricKey: CommercialUsageMetricKey,
    incrementBy = 1,
  ): Promise<void> {
    const parsed = commercialUsageMetricKeySchema.parse(metricKey);
    const organizationId = await organizationIdForWorkspace(workspaceId);
    if (!organizationId) throw new Error("Workspace not found.");
    await assertPlanLimit(organizationId, usageMetricToLimitKey[parsed], incrementBy);
  },
};
