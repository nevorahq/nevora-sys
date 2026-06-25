import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
// Deep imports (not the barrel) — баррель тянет "use server" actions с env,
// что ломает чистые unit-тесты схем. Берём только нужные значения.
import { ENTITY_LINK_TYPES, RELATION_DIRECTIONS } from "@/lib/entity-links/entity-link.types";
import { linkMetadataSchema } from "@/lib/entity-links/entity-link.schema";
import { RELATION_ENTITY_KINDS } from "../constants/relation.constants";

/**
 * Zod-схемы продуктового слоя relations.
 *
 * Отличие от lib/entity-links: здесь entityType строго ограничен 4 MVP-видами
 * (task/document/transaction/subscription), а relationType — управляемым
 * словарём. Defense in depth: Zod → service guards → RLS.
 */

const entityKindSchema = z.enum(RELATION_ENTITY_KINDS);
const relationTypeSchema = z.enum(ENTITY_LINK_TYPES);

export const createRelationSchema = z
  .object({
    sourceEntityType: entityKindSchema,
    sourceEntityId: uuidSchema,
    targetEntityType: entityKindSchema,
    targetEntityId: uuidSchema,
    relationType: relationTypeSchema,
    relationDirection: z.enum(RELATION_DIRECTIONS).default("bidirectional"),
    metadata: linkMetadataSchema.optional(),
  })
  .refine(
    (v) =>
      !(
        v.sourceEntityType === v.targetEntityType &&
        v.sourceEntityId === v.targetEntityId
      ),
    { message: "Entity cannot be linked to itself", path: ["targetEntityId"] },
  );

export const deleteRelationSchema = z.object({
  relationId: uuidSchema,
});

export const getRelationsSchema = z.object({
  entityType: entityKindSchema,
  entityId: uuidSchema,
});

export const searchRelationCandidatesSchema = z.object({
  // массив непуст — без него поиск не имеет смысла
  targetTypes: z.array(entityKindSchema).min(1, "At least one target type is required"),
  query: z.string().trim().max(120, "Query is too long").default(""),
  limit: z.number().int().min(1).max(20).default(8),
  // исключить уже связанные / саму сущность из результатов
  excludeId: uuidSchema.optional(),
});

export type CreateRelationParsed = z.infer<typeof createRelationSchema>;
export type DeleteRelationParsed = z.infer<typeof deleteRelationSchema>;
export type GetRelationsParsed = z.infer<typeof getRelationsSchema>;
export type SearchRelationCandidatesParsed = z.infer<typeof searchRelationCandidatesSchema>;
