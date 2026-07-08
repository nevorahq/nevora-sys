import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  commercialFeatureKeySchema,
  type CommercialFeatureKey,
} from "../plan-catalog.schema";
import { featureKeyToEntitlementKey } from "../plan-catalog";
import { getPlanEntitlement } from "./billing-service";

async function organizationIdForWorkspace(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();

  return typeof data?.organization_id === "string" ? data.organization_id : null;
}

export async function canUseFeatureForOrganization(
  organizationId: string,
  featureKey: CommercialFeatureKey,
): Promise<boolean> {
  const parsed = commercialFeatureKeySchema.safeParse(featureKey);
  if (!parsed.success) return false;

  const entitlement = await getPlanEntitlement(
    organizationId,
    featureKeyToEntitlementKey[parsed.data],
  );
  return entitlement?.value === true;
}

export const entitlementService = {
  async can(workspaceId: string, featureKey: CommercialFeatureKey): Promise<boolean> {
    const organizationId = await organizationIdForWorkspace(workspaceId);
    if (!organizationId) return false;
    return canUseFeatureForOrganization(organizationId, featureKey);
  },
};
