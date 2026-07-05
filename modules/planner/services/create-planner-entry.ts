import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { PLANNER_ENTRY_COLUMNS, type PlannerEntry, type PlannerEntryType } from "../types/planner.types";

export interface CreatePlannerEntryInput {
  rawText: string;
  entryType?: PlannerEntryType;
}

export type CreatePlannerEntryResult =
  | { ok: true; entry: PlannerEntry }
  | { ok: false; error: string };

/**
 * Insert a raw capture. organization_id / workspace_id / created_by come only
 * from the server context (never the client). Status starts at 'captured';
 * process-planner-entry advances it. Whitelisted columns only — no mass assign.
 */
export async function createPlannerEntry(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreatePlannerEntryInput,
): Promise<CreatePlannerEntryResult> {
  const rawText = input.rawText.trim();
  if (!rawText) return { ok: false, error: "Nothing to capture" };

  const id = randomUUID();
  const { data, error } = await supabase
    .from("planner_entries")
    .insert({
      id,
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      raw_text: rawText,
      entry_type: input.entryType ?? "text",
      source: "manual",
      status: "captured",
    })
    .select(PLANNER_ENTRY_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[createPlannerEntry] insert failed:", error?.message);
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

  return { ok: true, entry: data as PlannerEntry };
}
