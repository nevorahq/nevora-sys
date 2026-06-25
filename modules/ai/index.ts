// Types
export type {
  AiSummary,
  AiInsight,
  AiRecommendation,
  RawInsight,
  RawRecommendation,
} from "./types/ai.types";

// Constants
export {
  AI_ENTITY_TYPES, AI_INSIGHT_TYPES, AI_INSIGHT_MODULES,
  AI_SEVERITIES, AI_ACTION_TYPES, AI_PRIORITIES, AI_REC_STATUSES,
  SEVERITY_STYLES, PRIORITY_STYLES,
  SUMMARY_TTL_HOURS, INSIGHTS_TTL_HOURS,
} from "./constants/ai.constants";
export type {
  AiEntityType, AiInsightType, AiInsightModule,
  AiSeverity, AiActionType, AiPriority, AiRecStatus,
} from "./constants/ai.constants";

// Schemas
export {
  generateSummarySchema, generateInsightsSchema,
  dismissRecommendationSchema, updateRecommendationStatusSchema,
} from "./schemas/ai.schemas";

// Queries
export { getInsights }        from "./queries/get-insights";
export { getRecommendations } from "./queries/get-recommendations";
export { getSummary }         from "./queries/get-summary";
export type { GetInsightsOptions }        from "./queries/get-insights";
export type { GetRecommendationsOptions } from "./queries/get-recommendations";

// Actions
export { generateInsightsAction }        from "./actions/generate-insights.action";
export { generateRecommendationsAction } from "./actions/generate-recommendations.action";
export { generateSummaryAction }         from "./actions/generate-summary.action";
export { dismissRecommendationAction }   from "./actions/dismiss-recommendation.action";
