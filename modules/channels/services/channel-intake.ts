import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { processPlannerEntry } from "@/modules/planner/services/process-planner-entry";
import { captureInboxDocument } from "@/modules/planner/services/capture-inbox-document";
import { generateCaptureTitle } from "@/modules/planner/utils/generate-capture-title";
import { runDocumentExtraction } from "@/modules/documents/services/document-extraction-service";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import {
  isMissingColumnError,
  PLANNER_ENTRY_COLUMNS,
  type ChannelSignals,
  type PlannerEntry,
  type PlannerSuggestion,
} from "@/modules/planner/types/planner.types";
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
  input: { channel: Channel; messageKey: string; text: string; entryType?: "text" | "voice"; signals?: ChannelSignals },
): Promise<CaptureChannelTextResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: "empty" };
  if (text.length > PLANNER_RAW_TEXT_MAX_LENGTH) return { ok: false, code: "too_long" };

  const row: Record<string, unknown> = {
    id: randomUUID(),
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    owner_user_id: ctx.user.id,
    raw_text: text,
    entry_type: input.entryType ?? "text",
    source: "channel",
    channel: input.channel,
    channel_message_key: input.messageKey,
    status: "captured",
  };
  const signals = input.signals && Object.keys(input.signals).length > 0 ? input.signals : null;
  const insert = (withSignals: boolean) =>
    supabase
      .from("planner_entries")
      .insert(withSignals && signals ? { ...row, channel_signals: signals } : row)
      .select(PLANNER_ENTRY_COLUMNS)
      .single();

  let { data, error } = await insert(true);
  // Before migration 125 the source is simply not recorded; the capture still lands.
  if (signals && isMissingColumnError(error)) ({ data, error } = await insert(false));

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

/**
 * The capture already stored for a channel message, if any — checked before
 * paid work (a transcription) so a redelivery is not charged twice.
 */
export async function findChannelCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  channel: Channel,
  messageKey: string,
): Promise<PlannerEntry | null> {
  const { data } = await supabase
    .from("planner_entries")
    .select(PLANNER_ENTRY_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("channel", channel)
    .eq("channel_message_key", messageKey)
    .maybeSingle();
  return (data as PlannerEntry | null) ?? null;
}

/** Run AI intent detection on a channel capture; the drafts land in Review. */
export async function processChannelCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entry: PlannerEntry,
): Promise<{ status: PlannerEntry["status"]; suggestions: PlannerSuggestion[] }> {
  return processPlannerEntry(supabase, ctx, entry);
}

// ── Files (photos, documents) ────────────────────────────────────────────────

export type CaptureChannelFileResult =
  | { ok: true; documentId: string; entryId: string | null; extractionId: string | null; reused: boolean }
  | { ok: false; code: "forbidden" | "invalid_file" | "plan_limit" | "failed" };

/**
 * Store a file sent to a channel exactly like an Inbox photo/document upload —
 * the same Documents service (validation, quota, storage, rollback), the same
 * capture entry — with the service identity and the channel attribution. A
 * redelivery maps to the same deterministic capture id, so it reuses the stored
 * Document instead of creating a second one.
 */
export async function captureChannelFile(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: {
    channel: Channel;
    messageKey: string;
    file: File;
    note: string | null;
    kind: "photo" | "document";
    signals?: ChannelSignals;
  },
): Promise<CaptureChannelFileResult> {
  const result = await captureInboxDocument(supabase, ctx, {
    files: [input.file],
    captureId: channelCaptureId(ctx.org.id, input.channel, input.messageKey),
    note: input.note,
    entryType: input.kind,
    title: generateCaptureTitle({ filename: input.file.name, entryType: input.kind }),
    channel: { name: input.channel, messageKey: input.messageKey, signals: input.signals },
  });
  if (!result.ok) return { ok: false, code: result.code };
  return {
    ok: true,
    documentId: result.documentId,
    entryId: result.entryId,
    extractionId: result.extractionId,
    reused: result.reused,
  };
}

/** What reading a channel file produced, for the channel's reply. */
export type ChannelFileOutcome =
  | { kind: "receipt"; vendor: string | null; amount: number | null; currency: string | null }
  | { kind: "tasks"; count: number }
  | { kind: "saved" }
  | { kind: "failed" };

/**
 * Run the queued extraction (the same pipeline an Inbox upload runs) and say
 * what came out: an expense draft, task drafts, or a document kept for review.
 */
export async function processChannelFileCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  capture: { documentId: string; entryId: string | null; extractionId: string },
): Promise<ChannelFileOutcome> {
  const run = await runDocumentExtraction(supabase, ctx, capture.documentId, capture.extractionId);

  if (run.suggestionId) {
    const { data } = await supabase
      .from("financial_suggestions")
      .select("vendor_name, amount, currency")
      .eq("id", run.suggestionId)
      .eq("organization_id", ctx.org.id)
      .maybeSingle();
    const draft = data as { vendor_name: string | null; amount: number | string | null; currency: string | null } | null;
    return {
      kind: "receipt",
      vendor: draft?.vendor_name ?? null,
      amount: draft?.amount == null ? null : Number(draft.amount),
      currency: draft?.currency ?? null,
    };
  }

  if (capture.entryId) {
    const { count } = await supabase
      .from("planner_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.org.id)
      .eq("planner_entry_id", capture.entryId)
      .eq("status", "pending");
    if (count) return { kind: "tasks", count };
  }

  return run.status === "failed" ? { kind: "failed" } : { kind: "saved" };
}

/**
 * A stable capture id per org + channel message, shaped as a UUID for the
 * migration-105 `inbox_capture_id` column: a redelivered message reuses it.
 */
export function channelCaptureId(organizationId: string, channel: Channel, messageKey: string): string {
  const hex = createHash("sha256").update(`${organizationId}:${channel}:${messageKey}`).digest("hex");
  // Version nibble 5 (name-based) and the RFC 4122 variant bits.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
