import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import {
  ACTION_ITEM_TYPES,
  ACTION_ITEM_STATUSES,
  ACTION_ITEM_PRIORITIES,
  ACTION_SOURCE_TYPES,
  ACTION_LINK_RELATION_TYPES,
} from "../types/action-item.types";

export const actionItemTypeSchema = z.enum(ACTION_ITEM_TYPES);
export const actionItemStatusSchema = z.enum(ACTION_ITEM_STATUSES);
export const actionItemPrioritySchema = z.enum(ACTION_ITEM_PRIORITIES);
export const actionSourceTypeSchema = z.enum(ACTION_SOURCE_TYPES);
export const actionLinkRelationTypeSchema = z.enum(ACTION_LINK_RELATION_TYPES);

const metadataSchema = z
  .record(z.string(), z.unknown())
  .refine((m) => JSON.stringify(m).length <= 8_000, "Metadata is too large");

/**
 * Схема создания action item — используется генератором/executor'ом перед
 * insert (defense in depth, никакого mass assignment).
 */
export const createActionItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  type: actionItemTypeSchema,
  priority: actionItemPrioritySchema,
  priorityScore: z.number().int().min(0).max(100),
  sourceType: actionSourceTypeSchema,
  sourceId: uuidSchema,
  sourceEventId: uuidSchema.optional(),
  primaryEntityType: z.string().trim().max(64).optional(),
  primaryEntityId: uuidSchema.optional(),
  dueAt: z.string().datetime().optional(),
  aiGenerated: z.boolean().default(false),
  aiConfidence: z.number().min(0).max(1).optional(),
  aiReason: z.string().trim().max(1_000).optional(),
  metadata: metadataSchema.optional(),
  links: z
    .array(
      z.object({
        entityType: z.string().trim().min(1).max(64),
        entityId: uuidSchema,
        relationType: actionLinkRelationTypeSchema.default("related"),
      }),
    )
    .max(20)
    .optional(),
});

export type CreateActionItemParsed = z.infer<typeof createActionItemSchema>;
