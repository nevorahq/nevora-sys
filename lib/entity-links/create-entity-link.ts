"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { createEntityLinkSchema } from "./entity-link.schema";
import {
  ENTITY_LINK_COLUMNS,
  type CreateEntityLinkInput,
  type EntityLink,
  type EntityLinkResult,
} from "./entity-link.types";
import { verifyEntityOrganization } from "./verify-entity-organization";

/**
 * Создать связь между двумя сущностями.
 *
 * Используется как из Server Actions (modules/relations), так и из
 * automation-хендлеров (on-transaction-created связывает transaction → subscription).
 *
 * Безопасность:
 *   1. organization_id/workspace_id берутся ТОЛЬКО из серверного контекста
 *      (requireOrg), никогда из input → cross-tenant связь невозможна.
 *   2. Zod-валидация + явный запрет self-link.
 *   3. permission entity_link.create через canDo().
 *   4. Обе стороны проверяются verifyEntityOrganization (принадлежат active org).
 *   5. RLS WITH CHECK дублирует проверки на уровне БД (defense in depth).
 *   6. Дубликаты отсекаются partial unique-индексом (23505).
 *
 * Side effects (Phase 2): domain event (relation.created | relation.auto_created)
 * + audit log. Ошибка любого из них НЕ откатывает основную связь.
 *
 * Whitelist полей при insert — никакого mass assignment.
 */
export async function createEntityLink(
  input: CreateEntityLinkInput,
): Promise<EntityLinkResult> {
  const parsed = createEntityLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid entity link input",
    };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "entity_link.create")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();

  const [sourceExists, targetExists] = await Promise.all([
    verifyEntityOrganization(supabase, ctx.org.id, parsed.data.sourceType, parsed.data.sourceId),
    verifyEntityOrganization(supabase, ctx.org.id, parsed.data.targetType, parsed.data.targetId),
  ]);
  if (!sourceExists || !targetExists) {
    return { ok: false, error: "Linked entities must belong to the active organization" };
  }

  const metadata = parsed.data.metadata ?? {};
  const legacySource = metadata.source === "auto" ? "auto" : metadata.source === "ai" ? "ai" : "manual";
  const normalizedSource = parsed.data.source ?? (legacySource === "ai" ? "ai" : legacySource === "auto" ? "system" : "user");
  const confidenceScore =
    parsed.data.confidenceScore ?? (typeof metadata.confidence === "number" ? metadata.confidence : null);

  const { data, error } = await supabase
    .from("entity_links")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      source_type: parsed.data.sourceType,
      source_id: parsed.data.sourceId,
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      link_type: parsed.data.linkType,
      status: parsed.data.status,
      source: normalizedSource,
      confidence_score: confidenceScore,
      relation_direction: parsed.data.relationDirection,
      metadata: { ...metadata, source: legacySource, status: parsed.data.status },
      created_by: ctx.user.id,
    })
    .select(ENTITY_LINK_COLUMNS)
    .single();

  if (error) {
    // 23505 — нарушение partial unique-индекса: активная связь уже существует
    if (error.code === "23505") {
      return { ok: false, error: "Entity link already exists" };
    }
    console.error("[createEntityLink] failed:", error.message);
    return { ok: false, error: "Failed to create entity link" };
  }

  const link = data as EntityLink;

  // ── Side effects: domain event + audit log ──────────────────────────────
  const eventPayload = {
    source_entity_type: link.source_type,
    source_entity_id: link.source_id,
    target_entity_type: link.target_type,
    target_entity_id: link.target_id,
    relation_type: link.link_type,
  };

  if (normalizedSource === "system" || normalizedSource === "ai") {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "relation.auto_created",
      aggregateType: "entity_relation",
      aggregateId: link.id,
      payload: {
        ...eventPayload,
        source: normalizedSource,
        confidence: confidenceScore ?? 0,
        matched_by: Array.isArray(metadata.matched_by) ? metadata.matched_by : [],
      },
    });
  } else {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "relation.created",
      aggregateType: "entity_relation",
      aggregateId: link.id,
      payload: { ...eventPayload, source: "user" },
    });
  }

  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "relation",
    entityId: link.id,
    action: "create",
    newData: eventPayload,
    metadata: {
      source: normalizedSource === "user" ? "dashboard" : "system",
      relation_source: normalizedSource,
    },
  });

  return { ok: true, data: link };
}
