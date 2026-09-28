import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { processPlannerEntry } from "@/modules/planner/services/process-planner-entry";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import { PLANNER_ENTRY_COLUMNS, type PlannerEntry, type PlannerSuggestion } from "@/modules/planner/types/planner.types";
import type { Channel } from "../types";

/**
 * The one intake every channel ends in (ADR 002, step 1).
 *
 * An adapter verifies its request, maps the sender to a context
 * (`resolveChannelContext`) and calls this — nothing channel-specific happens
 * past this point. The capture is an ordinary Inbox entry: the same AI intent
 * detection, the same Review tab, the same confirm-first accept into Tasks.
 *
 * Split in two on purpose: `captureChannelText` is the durable write the
 * adapter awaits before acknowledging the channel (so a failure makes the
 * channel redeliver), `processChannelCapture` is the slower AI step that may
 * run after the acknowledgement.
 */

export type CaptureChannelTextResult =
  | { ok: true; entry: PlannerEntry; reused: boolean }
  | { ok: false; code: "empty" | "too_long" | "failed" };

export async function captureChannelText(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: { channel: Channel; messageKey: string; text: string },
): Promise<CaptureChannelTextResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: "empty" };
  if (text.length > PLANNER_RAW_TEXT_MAX_LENGTH) return { ok: false, code: "too_long" };

  const { data, error } = await supabase
    .from("planner_entries")
    .insert({
      id: randomUUID(),
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      owner_user_id: ctx.user.id,
      raw_text: text,
      entry_type: "text",
      source: "channel",
      channel: input.channel,
      channel_message_key: input.messageKey,
      status: "captured",
    })
    .select(PLANNER_ENTRY_COLUMNS)
    .single();

  if (!error && data) return { ok: true, entry: data as PlannerEntry, reused: false };

  // A redelivered message: the unique (org, channel, key) index already holds it.
  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("planner_entries")
      .select(PLANNER_ENTRY_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .eq("channel", input.channel)
      .eq("channel_message_key", input.messageKey)
      .maybeSingle();
    if (existing) return { ok: true, entry: existing as PlannerEntry, reused: true };
  }

  console.error("[captureChannelText] insert failed:", error?.message);
  return { ok: false, code: "failed" };
}

/** Run AI intent detection on a channel capture; the drafts land in Review. */
export async function processChannelCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entry: PlannerEntry,
): Promise<{ status: PlannerEntry["status"]; suggestions: PlannerSuggestion[] }> {
  return processPlannerEntry(supabase, ctx, entry);
}
