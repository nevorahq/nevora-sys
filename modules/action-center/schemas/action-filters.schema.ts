import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import {
  actionItemTypeSchema,
  actionItemStatusSchema,
  actionItemPrioritySchema,
  actionSourceTypeSchema,
} from "./action-item.schema";

/**
 * Фильтры фида Action Center. Все массивы опциональны; cursor — opaque-строка
 * (created_at + id) для keyset-пагинации.
 */
export const actionFiltersSchema = z.object({
  status: z.array(actionItemStatusSchema).optional(),
  priority: z.array(actionItemPrioritySchema).optional(),
  type: z.array(actionItemTypeSchema).optional(),
  sourceType: z.array(actionSourceTypeSchema).optional(),
  assignedTo: uuidSchema.optional(),
  workspaceId: uuidSchema.optional(),
  search: z.string().trim().max(120, "Search query is too long").optional(),
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ActionFiltersParsed = z.infer<typeof actionFiltersSchema>;
