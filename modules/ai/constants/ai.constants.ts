export const AI_ENTITY_TYPES = ["task", "deal", "client", "document", "pipeline", "org"] as const;
export type AiEntityType = (typeof AI_ENTITY_TYPES)[number];

export const AI_INSIGHT_TYPES = ["trend", "anomaly", "forecast", "comparison", "recommendation_summary"] as const;
export type AiInsightType = (typeof AI_INSIGHT_TYPES)[number];

export const AI_INSIGHT_MODULES = ["tasks", "crm", "documents", "analytics", "overall"] as const;
export type AiInsightModule = (typeof AI_INSIGHT_MODULES)[number];

export const AI_SEVERITIES = ["info", "warning", "success", "critical"] as const;
export type AiSeverity = (typeof AI_SEVERITIES)[number];

export const AI_ACTION_TYPES = [
  "follow_up", "close_deal", "reassign_task", "update_document",
  "contact_client", "review_pipeline", "custom",
] as const;
export type AiActionType = (typeof AI_ACTION_TYPES)[number];

export const AI_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type AiPriority = (typeof AI_PRIORITIES)[number];

export const AI_REC_STATUSES = ["pending", "accepted", "dismissed", "done"] as const;
export type AiRecStatus = (typeof AI_REC_STATUSES)[number];

export const SEVERITY_STYLES: Record<AiSeverity, string> = {
  info:     "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  warning:  "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  success:  "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const PRIORITY_STYLES: Record<AiPriority, string> = {
  low:      "text-text-muted",
  medium:   "text-blue-500",
  high:     "text-accent-yellow",
  critical: "text-red-500",
};

// Время жизни кеша саммари
export const SUMMARY_TTL_HOURS = 24;
export const INSIGHTS_TTL_HOURS = 6;
