"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { ENTITY_LINK_COLUMNS, type EntityLink } from "@/lib/entity-links";
import { deleteRelation, getRelationsForEntity } from "../services/relation.service";
import { deleteRelationSchema, getRelationsSchema } from "../schemas/relation.schema";
import type { RelationActionResult } from "../types/relation.types";

export async function confirmRelation(
  input: { relationId: string },
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  return updateRelationStatus(input, "confirmed", revalidate);
}

export async function rejectRelation(
  input: { relationId: string },
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  return updateRelationStatus(input, "rejected", revalidate);
}

export async function unlinkRelation(
  input: { relationId: string },
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  const res = await deleteRelation(input);
  if (res.ok && revalidate?.startsWith("/dashboard")) revalidatePath(revalidate);
  return res;
}

export async function getEntityRelations(input: unknown) {
  const parsed = getRelationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  return getRelationsForEntity(parsed.data);
}

async function updateRelationStatus(
  input: { relationId: string },
  status: "confirmed" | "rejected",
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  const parsed = deleteRelationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "entity_link.create", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { ok: false, error: err.message };
    throw err;
  }
  if (!canDo(ctx, "entity_link.create")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("entity_links")
    .select(ENTITY_LINK_COLUMNS)
    .eq("id", parsed.data.relationId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Relation not found" };
  const relation = existing as EntityLink;
  if (!["suggested", "waiting_confirmation", status].includes(relation.status)) {
    return { ok: false, error: `Cannot ${status === "confirmed" ? "confirm" : "reject"} a ${relation.status} relation` };
  }

  const { error } = await supabase
    .from("entity_links")
    .update({
      status,
      metadata: { ...relation.metadata, status },
    })
    .eq("id", relation.id)
    .eq("organization_id", ctx.org.id);
  if (error) {
    console.error("[updateRelationStatus] failed:", error.message);
    return { ok: false, error: "Failed to update relation" };
  }

  const eventPayload = {
    source_entity_type: relation.source_type,
    source_entity_id: relation.source_id,
    target_entity_type: relation.target_type,
    target_entity_id: relation.target_id,
    relation_type: relation.link_type,
    relation_id: relation.id,
    previous_state: relation.status,
    next_state: status,
  };

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: relation.workspace_id ?? ctx.workspace.id,
      eventName: status === "confirmed" ? "relation.confirmed" : "relation.rejected",
      aggregateType: "entity_relation",
      aggregateId: relation.id,
      payload: eventPayload,
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "relation",
      entityId: relation.id,
      action: "status_change",
      oldData: { status: relation.status },
      newData: { status },
      metadata: eventPayload,
    }),
  ]);

  if (revalidate?.startsWith("/dashboard")) revalidatePath(revalidate);
  return { ok: true, data: { id: relation.id } };
}
