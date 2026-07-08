import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import { ENTITY_LINK_TYPES, RELATION_DIRECTIONS } from "./entity-link.types";

/**
 * Zod-схемы для entity-links.
 *
 * Defense in depth: Zod (форма) → проверка self-link → RLS (БД).
 * `*_type` ограничен по длине, чтобы исключить мусор/oversized-строки.
 */

const entityTypeSchema = z
  .string()
  .trim()
  .min(1, "Entity type is required")
  .max(64, "Entity type is too long");

// metadata: безопасный JSON-объект. Запрещаем строки с HTML-тегами,
// ограничиваем размер сериализованного payload (как domain_events).
export const linkMetadataSchema = z
  .record(z.string(), z.unknown())
  .refine((m) => JSON.stringify(m).length <= 8_000, "Metadata is too large")
  .refine(
    (m) => !/<[a-z][\s\S]*>/i.test(JSON.stringify(m)),
    "Metadata must not contain HTML",
  );

export const createEntityLinkSchema = z
  .object({
    sourceType: entityTypeSchema,
    sourceId: uuidSchema,
    targetType: entityTypeSchema,
    targetId: uuidSchema,
    linkType: z.enum(ENTITY_LINK_TYPES).default("related"),
    status: z.enum(["suggested", "waiting_confirmation", "confirmed", "rejected", "unlinked"]).default("confirmed"),
    source: z.enum(["user", "system", "ai"]).default("user"),
    confidenceScore: z.number().min(0).max(1).nullable().optional(),
    relationDirection: z.enum(RELATION_DIRECTIONS).default("bidirectional"),
    metadata: linkMetadataSchema.optional(),
  })
  .refine(
    (v) => !(v.sourceType === v.targetType && v.sourceId === v.targetId),
    { message: "Entity cannot be linked to itself", path: ["targetId"] },
  );

export const getEntityLinksSchema = z
  .object({
    source: z.object({ type: entityTypeSchema, id: uuidSchema }).optional(),
    target: z.object({ type: entityTypeSchema, id: uuidSchema }).optional(),
    linkType: z.enum(ENTITY_LINK_TYPES).optional(),
  })
  .refine((v) => v.source !== undefined || v.target !== undefined, {
    message: "Either source or target must be provided",
  });

export const deleteEntityLinkSchema = z.object({
  id: uuidSchema,
});

export type CreateEntityLinkParsed = z.infer<typeof createEntityLinkSchema>;
export type GetEntityLinksParsed = z.infer<typeof getEntityLinksSchema>;
export type DeleteEntityLinkParsed = z.infer<typeof deleteEntityLinkSchema>;
