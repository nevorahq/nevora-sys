"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { deleteEntityLinkSchema } from "./entity-link.schema";
import {
  ENTITY_LINK_COLUMNS,
  type DeleteEntityLinkInput,
  type EntityLink,
  type EntityLinkResult,
} from "./entity-link.types";

/**
 * Soft-delete связи (Phase 2: раньше был hard delete).
 *
 * Безопасность:
 *   - permission entity_link.delete через canDo();
 *   - soft_delete_entity_link RPC (SECURITY DEFINER) проверяет can_delete_data
 *     и scope по organization_id → удалить чужую (cross-tenant) связь невозможно;
 *   - PostgREST перепроверяет SELECT после скрытия строки → soft-delete идёт
 *     через RPC, а не UPDATE-политику (зеркалит soft_delete_document).
 *
 * Side effects: domain events relation.deleted/relation.unlinked + audit log.
 */
export async function deleteEntityLink(
  input: DeleteEntityLinkInput,
): Promise<EntityLinkResult<{ id: string }>> {
  const parsed = deleteEntityLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid id",
    };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "entity_link.delete")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();

  // Снимок до удаления — нужен для audit old_data и event payload.
  // RLS SELECT уже скрывает чужие/удалённые строки.
  const { data: existing } = await supabase
    .from("entity_links")
    .select(ENTITY_LINK_COLUMNS)
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  if (!existing) {
    // Не раскрываем существование чужих/удалённых связей.
    return { ok: false, error: "Entity link not found" };
  }

  const link = existing as EntityLink;

  const { error } = await supabase.rpc("soft_delete_entity_link", {
    p_link_id: parsed.data.id,
    p_organization_id: ctx.org.id,
  });

  if (error) {
    if (error.code === "42501") return { ok: false, error: "Forbidden" };
    if (error.code === "P0002") return { ok: false, error: "Entity link not found" };
    console.error("[deleteEntityLink] failed:", error.message);
    return { ok: false, error: "Failed to delete entity link" };
  }

  const eventPayload = {
    source_entity_type: link.source_type,
    source_entity_id: link.source_id,
    target_entity_type: link.target_type,
    target_entity_id: link.target_id,
    relation_type: link.link_type,
  };

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "relation.deleted",
      aggregateType: "entity_relation",
      aggregateId: link.id,
      payload: eventPayload,
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "relation.unlinked",
      aggregateType: "entity_relation",
      aggregateId: link.id,
      payload: eventPayload,
    }),
  ]);

  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "relation",
    entityId: link.id,
    action: "delete",
    oldData: eventPayload,
    metadata: { source: "dashboard" },
  });

  return { ok: true, data: { id: link.id } };
}
