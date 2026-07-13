import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { PLANNER_ENTRY_COLUMNS, type PlannerEntry, type PlannerEntryType } from "../types/planner.types";

/**
 * The four business entities that may seed a capture. Each maps to the matching
 * `source_*_id` pointer on planner_entries (migration 080) — the pointers that
 * `expire_orphaned_planner_suggestions` (migration 094) reconciles when the
 * entity is deleted.
 */
export type PlannerEntrySourceEntity =
  | { kind: "document"; id: string }
  | { kind: "subscription"; id: string }
  | { kind: "task"; id: string }
  | { kind: "transaction"; id: string };

const SOURCE_COLUMN: Record<PlannerEntrySourceEntity["kind"], string> = {
  document: "source_document_id",
  subscription: "source_subscription_id",
  task: "source_task_id",
  transaction: "source_transaction_id",
};

/** planner_entries.source dictionary (migration 080) keyed by entity kind. */
const ENTRY_SOURCE: Record<PlannerEntrySourceEntity["kind"], string> = {
  document: "document",
  subscription: "subscription",
  task: "task",
  transaction: "money",
};

export interface CreateSourcedPlannerEntryInput {
  entity: PlannerEntrySourceEntity;
  /** Human-readable label of the source entity; becomes the capture's raw_text. */
  summary: string;
  /**
   * Shape of the capture. Defaults to 'document' for a document source and 'text'
   * otherwise. Inbox photo capture passes 'photo'.
   */
  entryType?: PlannerEntryType;
  /**
   * Initial status. Defaults to 'suggested' (the caller attaches a deterministic
   * suggestion straight away). Document/photo captures that hand off to the
   * extraction pipeline pass 'processing'.
   */
  status?: PlannerEntry["status"];
}

export type CreateSourcedPlannerEntryResult =
  | { ok: true; entry: PlannerEntry; reused: boolean }
  | { ok: false; error: string };

/**
 * Capture an entry that a business entity seeded, rather than a typed thought.
 *
 * Kept separate from createPlannerEntry on purpose: that one is fed by a Server
 * Action reading FormData, so it must never accept a source pointer from the
 * client. This one is server-internal — the caller has already loaded the entity
 * under RLS and knows its id is real.
 *
 * Status starts at 'suggested' rather than 'captured': there is no AI detection
 * step here, the caller attaches a deterministic suggestion straight away.
 */
export async function createSourcedPlannerEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateSourcedPlannerEntryInput,
): Promise<CreateSourcedPlannerEntryResult> {
  const { entity, summary } = input;
  const entryType = input.entryType ?? (entity.kind === "document" ? "document" : "text");
  const sourceColumn = SOURCE_COLUMN[entity.kind];
  const id = randomUUID();

  const { data, error } = await supabase
    .from("planner_entries")
    .insert({
      id,
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      owner_user_id: ctx.user.id,
      raw_text: summary.trim() || null,
      entry_type: entryType,
      source: ENTRY_SOURCE[entity.kind],
      status: input.status ?? "suggested",
      [sourceColumn]: entity.id,
    })
    .select(PLANNER_ENTRY_COLUMNS)
    .single();

  if (error || !data) {
    // A document source is unique per (org, owner, source_document_id) since
    // migration 105. A retry or a crash-recovery reconcile collides here — reuse
    // the entry that already exists instead of reporting a failure.
    if (error?.code === "23505") {
      const { data: existing } = await supabase
        .from("planner_entries")
        .select(PLANNER_ENTRY_COLUMNS)
        .eq("organization_id", ctx.org.id)
        .eq("owner_user_id", ctx.user.id)
        .eq(sourceColumn, entity.id)
        .maybeSingle();
      if (existing) return { ok: true, entry: existing as PlannerEntry, reused: true };
    }
    console.error("[createSourcedPlannerEntry] insert failed:", error?.message);
    return { ok: false, error: "Failed to capture entry" };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "planner_entry.created",
    aggregateType: "planner_entry",
    aggregateId: id,
    payload: { entry_type: data.entry_type, source: data.source },
  });

  return { ok: true, entry: data as PlannerEntry, reused: false };
}
