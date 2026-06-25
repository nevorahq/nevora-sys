import { z } from "zod";
import {
  AI_ENTITY_TYPES, AI_INSIGHT_TYPES, AI_INSIGHT_MODULES,
  AI_SEVERITIES, AI_ACTION_TYPES, AI_PRIORITIES,
} from "../constants/ai.constants";

export const generateSummarySchema = z.object({
  entityType: z.enum(AI_ENTITY_TYPES),
  entityId:   z.string().uuid(),
});
export type GenerateSummaryInput = z.infer<typeof generateSummarySchema>;

export const generateInsightsSchema = z.object({
  periodDays: z.number().int().min(1).max(365).default(30),
});
export type GenerateInsightsInput = z.infer<typeof generateInsightsSchema>;

export const dismissRecommendationSchema = z.object({
  recommendationId: z.string().uuid(),
});
export type DismissRecommendationInput = z.infer<typeof dismissRecommendationSchema>;

export const updateRecommendationStatusSchema = z.object({
  recommendationId: z.string().uuid(),
  status: z.enum(["accepted", "done"] as const),
});
export type UpdateRecommendationStatusInput = z.infer<typeof updateRecommendationStatusSchema>;

// Для валидации ответа Claude
export const rawInsightSchema = z.object({
  insight_type: z.enum(AI_INSIGHT_TYPES),
  module:       z.enum(AI_INSIGHT_MODULES),
  title:        z.string().min(1).max(200),
  body:         z.string().min(1).max(3000),
  severity:     z.enum(AI_SEVERITIES),
});

export const rawRecommendationSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  action_type: z.enum(AI_ACTION_TYPES),
  priority:    z.enum(AI_PRIORITIES),
});
