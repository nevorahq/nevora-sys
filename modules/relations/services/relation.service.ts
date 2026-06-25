import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createEntityLink, deleteEntityLink } from "@/lib/entity-links";
import {
  createRelationSchema,
  deleteRelationSchema,
  getRelationsSchema,
} from "../schemas/relation.schema";
import { fetchEntityRelations } from "../queries/get-entity-relations.query";
import { groupRelationsByType } from "../utils/group-relations-by-type";
import { assertEntityInOrg } from "./relation-access.service";
import type {
  GroupedRelations,
  RelationActionResult,
} from "../types/relation.types";

const EMPTY_GROUPED: GroupedRelations = {
  tasks: [],
  documents: [],
  transactions: [],
  subscriptions: [],
  total: 0,
};

export interface CreateRelationInput {
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string;
  relationType: string;
  relationDirection?: string;
  metadata?: Record<string, unknown>;
}

export interface GetRelationsInput {
  entityType: string;
  entityId: string;
}

/**
 * Связи сущности в обе стороны, сгруппированные по типу.
 *
 * Security: requireOrg, permission entity_link.read, access-check самой
 * сущности (cross-tenant guard), затем tenant-scoped fetch + RLS.
 */
export async function getRelationsForEntity(
  input: GetRelationsInput,
): Promise<RelationActionResult<GroupedRelations>> {
  const parsed = getRelationsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "entity_link.read")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();

  const accessible = await assertEntityInOrg(
    supabase,
    ctx.org.id,
    parsed.data.entityType,
    parsed.data.entityId,
  );
  if (!accessible) {
    // Не раскрываем существование чужих сущностей.
    return { ok: false, error: "Entity not found" };
  }

  const items = await fetchEntityRelations(
    supabase,
    ctx.org.id,
    parsed.data.entityType,
    parsed.data.entityId,
  );

  return { ok: true, data: groupRelationsByType(items) };
}

/**
 * Создать связь (ручное связывание из UI).
 *
 * Всю тяжёлую безопасность (permission, cross-tenant verify, dedupe,
 * domain event, audit log) выполняет lib/createEntityLink — здесь только
 * маппинг полей продуктового слоя + форс manual-источника.
 */
export async function createRelation(
  input: CreateRelationInput,
): Promise<RelationActionResult<{ id: string }>> {
  const parsed = createRelationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid relation" };
  }

  const res = await createEntityLink({
    sourceType: parsed.data.sourceEntityType,
    sourceId: parsed.data.sourceEntityId,
    targetType: parsed.data.targetEntityType,
    targetId: parsed.data.targetEntityId,
    linkType: parsed.data.relationType,
    relationDirection: parsed.data.relationDirection,
    metadata: { ...(parsed.data.metadata ?? {}), source: "manual" },
  });

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { id: res.data.id } };
}

/**
 * Soft-delete связи. Permission + cross-tenant guard + event + audit —
 * внутри lib/deleteEntityLink.
 */
export async function deleteRelation(
  input: { relationId: string },
): Promise<RelationActionResult<{ id: string }>> {
  const parsed = deleteRelationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };
  }

  const res = await deleteEntityLink({ id: parsed.data.relationId });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { id: res.data.id } };
}

export { EMPTY_GROUPED };
