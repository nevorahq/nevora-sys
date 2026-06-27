import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { computePriority } from "./priority-engine";
import type { ActionItemType, ActionSourceType } from "../types/action-item.types";

/**
 * Create an Action Center item for a document/extraction outcome.
 *
 * Idempotent by design: the (org, type, source_type, source_id) unique index
 * from migration 048 makes a duplicate insert a no-op (23505 swallowed). For a
 * drafted expense we use source_type='transaction' + source_id=transactionId so
 * the key matches what the background generator would produce.
 */
export interface CreateActionItemInput {
  type: ActionItemType;
  title: string;
  description: string;
  sourceType: ActionSourceType;
  sourceId: string;
  primaryEntityType: string;
  primaryEntityId: string;
  financialImpact?: number | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createActionItemForDocument(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateActionItemInput,
): Promise<{ ok: boolean; actionItemId: string | null }> {
  const { score, priority } = computePriority({
    type: input.type,
    sourceType: input.sourceType,
    financialImpact: input.financialImpact ?? null,
    aiConfidence: input.aiConfidence ?? null,
  });

  const { data, error } = await supabase
    .from("action_items")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      title: input.title,
      description: input.description,
      type: input.type,
      status: "open",
      priority,
      priority_score: score,
      source_type: input.sourceType,
      source_id: input.sourceId,
      primary_entity_type: input.primaryEntityType,
      primary_entity_id: input.primaryEntityId,
      ai_generated: input.aiConfidence != null,
      ai_confidence: input.aiConfidence ?? null,
      ai_reason: input.aiReason ?? null,
      metadata: input.metadata ?? {},
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 — an active item for this signal already exists; that's fine.
    if (error.code === "23505") return { ok: true, actionItemId: null };
    console.error("[createActionItemForDocument] insert failed:", error.message);
    return { ok: false, actionItemId: null };
  }

  const actionItemId = data.id as string;

  // Primary link to the originating entity (best-effort).
  await supabase.from("action_item_links").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    action_item_id: actionItemId,
    entity_type: input.primaryEntityType,
    entity_id: input.primaryEntityId,
    relation_type: "primary",
  });

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "action_center.item_created",
    aggregateType: "action_item",
    aggregateId: actionItemId,
    payload: {
      type: input.type,
      source_type: input.sourceType,
      source_id: input.sourceId,
      priority,
    },
  });

  return { ok: true, actionItemId };
}
