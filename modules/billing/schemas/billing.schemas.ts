import { z } from "zod";
import { PLAN_SLUGS, BILLING_CYCLES, USAGE_METRICS } from "../constants/billing.constants";

export const changePlanSchema = z.object({
  planSlug:     z.enum(PLAN_SLUGS),
  billingCycle: z.enum(BILLING_CYCLES),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;

export const setFeatureFlagSchema = z.object({
  flagKey:   z.string().min(1).max(100),
  isEnabled: z.boolean(),
  reason:    z.string().max(500).optional(),
});
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagSchema>;

export const recordUsageSchema = z.object({
  metric:   z.enum(USAGE_METRICS),
  quantity: z.number().int().min(0),
});
export type RecordUsageInput = z.infer<typeof recordUsageSchema>;
