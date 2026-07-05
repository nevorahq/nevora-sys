import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import { PLANNER_ENTRY_TYPES } from "../types/planner.types";

export const PLANNER_RAW_TEXT_MAX_LENGTH = 4000;

/**
 * Input for capturing a new planner entry.
 *
 * MVP is text-first: `raw_text` is required and whitelisted. entry_type defaults
 * to "text". organization_id / workspace_id are NEVER accepted here — they come
 * from the server context in the action.
 */
export const createPlannerEntrySchema = z.object({
  rawText: z
    .string()
    .trim()
    .min(1, "Enter something to capture")
    .max(PLANNER_RAW_TEXT_MAX_LENGTH, `Keep it under ${PLANNER_RAW_TEXT_MAX_LENGTH} characters`),
  entryType: z.enum(PLANNER_ENTRY_TYPES).default("text"),
});

export type CreatePlannerEntryInput = z.infer<typeof createPlannerEntrySchema>;

export const updatePlannerEntrySchema = z.object({
  entryId: uuidSchema,
  rawText: z
    .string()
    .trim()
    .min(1, "Enter something to capture")
    .max(PLANNER_RAW_TEXT_MAX_LENGTH, `Keep it under ${PLANNER_RAW_TEXT_MAX_LENGTH} characters`),
});

export type UpdatePlannerEntryInput = z.infer<typeof updatePlannerEntrySchema>;

export const deletePlannerEntrySchema = z.object({
  entryId: uuidSchema,
});

export type DeletePlannerEntryInput = z.infer<typeof deletePlannerEntrySchema>;
