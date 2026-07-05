import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import { ENTITY_LINK_TYPES } from "@/lib/entity-links/entity-link.types";
import { PLANNER_SUGGESTION_TYPES } from "../types/planner.types";

export const PLANNER_TITLE_MAX_LENGTH = 200;
export const PLANNER_DESCRIPTION_MAX_LENGTH = 2000;
export const PLANNER_REJECT_REASON_MAX_LENGTH = 500;

/**
 * Shape the AI detector must return (per proposal). Validated before anything is
 * written to planner_suggestions so a malformed AI response fails safely.
 */
export const detectedSuggestionSchema = z.object({
  suggestionType: z.enum(PLANNER_SUGGESTION_TYPES),
  title: z.string().trim().min(1).max(PLANNER_TITLE_MAX_LENGTH),
  description: z.string().trim().max(PLANNER_DESCRIPTION_MAX_LENGTH).optional(),
  proposedPayload: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
});

export const plannerIntentDetectionSchema = z.object({
  detectedIntent: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(detectedSuggestionSchema).max(5),
  missingInformation: z.array(z.string().trim().min(1)).max(10).optional(),
});

// ── Review actions ───────────────────────────────────────────────────────────

export const acceptPlannerSuggestionSchema = z.object({
  suggestionId: uuidSchema,
});
export type AcceptPlannerSuggestionInput = z.infer<typeof acceptPlannerSuggestionSchema>;

/**
 * Edit allows only safe, user-owned fields. suggestion_type may be changed only
 * to another valid type (re-validated); the payload is fully replaced (whitelist,
 * not a merge, to avoid smuggling in stale keys).
 */
export const editPlannerSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  title: z.string().trim().min(1).max(PLANNER_TITLE_MAX_LENGTH).optional(),
  description: z.string().trim().max(PLANNER_DESCRIPTION_MAX_LENGTH).nullish(),
  suggestionType: z.enum(PLANNER_SUGGESTION_TYPES).optional(),
  proposedPayload: z.record(z.string(), z.unknown()).optional(),
});
export type EditPlannerSuggestionInput = z.infer<typeof editPlannerSuggestionSchema>;

export const rejectPlannerSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  reason: z.string().trim().max(PLANNER_REJECT_REASON_MAX_LENGTH).optional(),
});
export type RejectPlannerSuggestionInput = z.infer<typeof rejectPlannerSuggestionSchema>;

// ── Per-type accept payloads (re-validated at accept time, never mass-assigned) ─

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createTaskPayloadSchema = z.object({
  title: z.string().trim().min(1).max(PLANNER_TITLE_MAX_LENGTH),
  description: z.string().trim().max(PLANNER_DESCRIPTION_MAX_LENGTH).optional().default(""),
  dueDate: ISO_DATE.nullish(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});
export type CreateTaskPayload = z.infer<typeof createTaskPayloadSchema>;

/**
 * Financial-capture payload. Money-safe by construction: it only ever feeds the
 * financial-task service (which never posts a transaction). amount is optional —
 * a reminder without an amount is a valid non-payable financial task.
 */
export const financialTaskPayloadSchema = z.object({
  title: z.string().trim().min(1).max(PLANNER_TITLE_MAX_LENGTH),
  description: z.string().trim().max(PLANNER_DESCRIPTION_MAX_LENGTH).optional().default(""),
  financialDueDate: ISO_DATE,
  reminderOffsetDays: z.number().int().min(0).max(365).optional(),
  amount: z.number().positive().nullish(),
  currency: z.string().trim().length(3).toUpperCase().nullish(),
  providerName: z.string().trim().max(120).nullish(),
});
export type FinancialTaskPayload = z.infer<typeof financialTaskPayloadSchema>;

export const linkEntitiesPayloadSchema = z.object({
  sourceType: z.string().trim().min(1).max(40),
  sourceId: uuidSchema,
  targetType: z.string().trim().min(1).max(40),
  targetId: uuidSchema,
  linkType: z.enum(ENTITY_LINK_TYPES).default("related_to"),
});
export type LinkEntitiesPayload = z.infer<typeof linkEntitiesPayloadSchema>;

export const createActionItemPayloadSchema = z.object({
  title: z.string().trim().min(1).max(PLANNER_TITLE_MAX_LENGTH),
  description: z.string().trim().max(PLANNER_DESCRIPTION_MAX_LENGTH).optional().default(""),
});
export type CreateActionItemPayload = z.infer<typeof createActionItemPayloadSchema>;
