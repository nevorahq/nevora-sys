import "server-only";

import type { CommercialFeatureKey } from "../plan-catalog.schema";
import { commercialFeatureLabels } from "../plan-catalog";
import { entitlementService } from "./entitlement-service";

export interface BlockedFeatureReason {
  featureKey: CommercialFeatureKey;
  title: string;
  message: string;
  cta: string;
}

export const featureGateService = {
  async getBlockedReason(
    workspaceId: string,
    featureKey: CommercialFeatureKey,
  ): Promise<BlockedFeatureReason | null> {
    const allowed = await entitlementService.can(workspaceId, featureKey);
    if (allowed) return null;

    const label = commercialFeatureLabels[featureKey] ?? "This feature";
    return {
      featureKey,
      title: `${label} is not included in your current plan`,
      message: "Choose a higher plan to unlock this workflow for your workspace.",
      cta: "Upgrade",
    };
  },
};
