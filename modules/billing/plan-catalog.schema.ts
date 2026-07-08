import { z } from "zod";

export const commercialPlanKeys = ["free", "starter", "pro", "business"] as const;
export const commercialFeatureKeys = [
  "documents.upload",
  "documents.process",
  "ai.suggestions.generate",
  "team.members.invite",
  "storage.files.upload",
  "automations.run",
] as const;
export const commercialUsageMetricKeys = [
  "documents_processed_monthly",
  "ai_suggestions_monthly",
  "team_members_count",
  "storage_used_bytes",
  "automation_runs_monthly",
] as const;

export const commercialPlanKeySchema = z.enum(commercialPlanKeys);
export const commercialFeatureKeySchema = z.enum(commercialFeatureKeys);
export const commercialUsageMetricKeySchema = z.enum(commercialUsageMetricKeys);

export type CommercialPlanKey = z.infer<typeof commercialPlanKeySchema>;
export type CommercialFeatureKey = z.infer<typeof commercialFeatureKeySchema>;
export type CommercialUsageMetricKey = z.infer<typeof commercialUsageMetricKeySchema>;
