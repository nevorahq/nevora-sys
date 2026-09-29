import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import { DOCUMENT_MAX_FILE_SIZE_BYTES } from "@/modules/documents/constants/document.constants";
import { logger } from "@/lib/observability/logger";
import type { CurrentContext } from "@/lib/context/current-context";
import type { PlannerEntry } from "@/modules/planner/types/planner.types";
import { resolveChannelContext } from "../services/channel-context";
import {
  captureChannelFile,
  captureChannelText,
  processChannelCapture,
  processChannelFileCapture,
} from "../services/channel-intake";
import { findActiveIntegration } from "../services/link-codes";
import { resolveUserLocale } from "../services/user-locale";
import {
  captureTextFromEmail,
  cleanSubject,
  emailSignals,
  hasSubstantialBody,
  isAutomated,
  isSentByOwner,
  readGmailForwardingConfirmation,
} from "./email-content";
import { findInboxToken } from "./inbound-address";
import type { AttachmentDownload, FetchedEmail, InboundEmailEvent } from "./resend-inbound";

/** Attachments read per email; the rest are left in the mailbox. */
export const MAX_ATTACHMENTS_PER_EMAIL = 5;

export interface InboundEmailDeps {
  /** Service-role client: a webhook has no user session. */
  supabase: SupabaseClient;
  /** Our receiving domain. */
  domain: string;
  fetchEmail: (emailId: string) => Promise<FetchedEmail | null>;
  downloadAttachment: (emailId: string, attachmentId: string, maxBytes: number) => Promise<AttachmentDownload>;
  /** The account email of a user — the address allowed to forward to them. */
  ownerEmail: (userId: string) => Promise<string | null>;
  notify: (to: string, subject: string, text: string) => Promise<void>;
}

export interface InboundEmailResult {
  action:
    | "ignored"
    | "unknown_address"
    | "forwarding_confirmation"
    | "automated"
    | "sender_rejected"
    | "context_denied"
    | "captured"
    | "duplicate";
  after?: () => Promise<void>;
}

/**
 * Email forwarding adapter (ADR 002, step 4). The per-user address identifies
 * the user; the sender must be that user (a manual forward, or Gmail's
 * automatic forwarding naming them), so a leaked address alone cannot fill the
 * Inbox. Text goes to task detection, attachments to the Documents pipeline —
 * the shared channel intake, nothing email-specific past this point.
 *
 * Successful captures are not answered (the Inbox is the answer; replies risk
 * mail loops). Only a refused forward is reported, and only to the owner's own
 * account address — never to the sender, which may be a vendor.
 *
 * Throws when something transient failed before the capture was stored, so the
 * webhook answers 500 and Resend redelivers; the message keys keep it single.
 */
export async function handleInboundEmail(event: InboundEmailEvent, deps: InboundEmailDeps): Promise<InboundEmailResult> {
  if (event.type !== "email.received" || !event.data?.email_id) return { action: "ignored" };

  const token = findInboxToken(event.data.to ?? [], deps.domain);
  if (!token) return { action: "ignored" };
  // Unknown or rotated address: no reply — answering unknown mail is backscatter.
  const integration = await findActiveIntegration(deps.supabase, "email", token);
  if (!integration) return { action: "unknown_address" };

  const email = await deps.fetchEmail(event.data.email_id);
  if (!email) throw new Error("Received email could not be fetched.");

  const confirmation = readGmailForwardingConfirmation(email);
  if (confirmation) {
    await deps.supabase
      .from("channel_integrations")
      .update({
        metadata: {
          forwarding_confirmation: {
            code: confirmation.code,
            link: confirmation.link,
            requested_by: confirmation.requestedBy,
            received_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", integration.id);
    return { action: "forwarding_confirmation" };
  }

  if (isAutomated(email)) return { action: "automated" };

  const owner = await deps.ownerEmail(integration.user_id);
  if (!owner || !isSentByOwner(email, [owner])) {
    logger.info("email_channel.sender_rejected", { integrationId: integration.id });
    return { action: "sender_rejected" };
  }

  const locale = await resolveUserLocale(deps.supabase, integration.user_id, "en");
  const copy = getDictionaryFor(locale).channels.email.notice;
  const subject = cleanSubject(email.subject) || email.subject;
  const noticeLines: string[] = [];
  const notifyOwner = () =>
    deps.notify(owner, copy.subject, [copy.intro.replace("{subject}", subject), ...noticeLines].join("\n\n"));

  const context = await resolveChannelContext(deps.supabase, integration);
  if (!context.ok) {
    noticeLines.push(context.reason === "not_member" ? copy.notMember : context.reason === "read_only" ? copy.readOnly : copy.forbidden);
    await notifyOwner();
    return { action: "context_denied" };
  }
  const ctx = context.ctx;
  const messageKey = emailMessageKey(email.messageId || event.data.email_id);
  // Who the forwarded mail is from, for a learned project rule (migration 125).
  const signals = emailSignals(email, [owner]);

  // ── Attachments → Documents (receipts, invoices, briefs) ──────────────────
  const files: Array<{ documentId: string; entryId: string | null; extractionId: string }> = [];
  let storedFiles = 0;
  let reusedFiles = 0;
  let planLimit = false;
  const maxMb = DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024);
  for (const attachment of email.attachments.filter((a) => !a.inline).slice(0, MAX_ATTACHMENTS_PER_EMAIL)) {
    const name = attachment.filename?.trim() || `attachment-${attachment.id.slice(0, 8)}`;
    if (attachment.size != null && attachment.size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
      noticeLines.push(copy.tooLarge.replace("{name}", name).replace("{max}", String(maxMb)));
      continue;
    }
    const downloaded = await deps.downloadAttachment(event.data.email_id, attachment.id, DOCUMENT_MAX_FILE_SIZE_BYTES);
    if (!downloaded.ok) {
      if (downloaded.reason === "too_large") {
        noticeLines.push(copy.tooLarge.replace("{name}", name).replace("{max}", String(maxMb)));
        continue;
      }
      throw new Error("Email attachment could not be downloaded.");
    }
    const stored = await captureChannelFile(deps.supabase, ctx, {
      channel: "email",
      messageKey: `${messageKey}#${attachment.id}`,
      file: new File([downloaded.bytes], name, { type: attachment.contentType }),
      note: subject || null,
      kind: attachment.contentType.startsWith("image/") ? "photo" : "document",
      signals,
    });
    if (!stored.ok) {
      if (stored.code === "failed") throw new Error("Email attachment could not be stored.");
      if (stored.code === "plan_limit") {
        planLimit = true;
        break;
      }
      continue; // invalid_file (an .ics, a zip…) or forbidden: not a document we read
    }
    storedFiles += 1;
    if (stored.reused) reusedFiles += 1;
    else if (stored.extractionId) {
      files.push({ documentId: stored.documentId, entryId: stored.entryId, extractionId: stored.extractionId });
    }
  }
  if (planLimit) noticeLines.push(copy.planLimit);

  // ── Text → task detection (skipped for a one-liner around attachments) ────
  let textEntry: PlannerEntry | null = null;
  let textStored = false;
  let textReused = false;
  if (storedFiles === 0 || hasSubstantialBody(email)) {
    const captured = await captureChannelText(deps.supabase, ctx, {
      channel: "email",
      messageKey,
      text: captureTextFromEmail(email, PLANNER_RAW_TEXT_MAX_LENGTH),
      signals,
    });
    if (!captured.ok && captured.code === "failed") throw new Error("Email text could not be stored.");
    if (captured.ok) {
      textStored = !captured.reused;
      textReused = captured.reused;
      if (!captured.reused || captured.entry.status === "captured") textEntry = captured.entry;
    }
  }

  if (noticeLines.length > 0) await notifyOwner();

  const newCaptures = storedFiles - reusedFiles + (textStored ? 1 : 0);
  const pending = files.length > 0 || textEntry !== null;
  if (newCaptures === 0 && !pending) return { action: textReused || reusedFiles > 0 ? "duplicate" : "ignored" };

  return {
    action: newCaptures > 0 ? "captured" : "duplicate",
    after: pending ? () => processEmailCaptures(deps.supabase, ctx, textEntry, files) : undefined,
  };
}

async function processEmailCaptures(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  textEntry: PlannerEntry | null,
  files: Array<{ documentId: string; entryId: string | null; extractionId: string }>,
): Promise<void> {
  if (textEntry) await processChannelCapture(supabase, ctx, textEntry);
  for (const file of files) await processChannelFileCapture(supabase, ctx, file);
}

/**
 * The per-channel message key (migration 121 caps it at 200 chars): the
 * Message-ID without its angle brackets, hashed when unusually long.
 */
export function emailMessageKey(messageId: string): string {
  const id = messageId.trim().replace(/^<|>$/g, "");
  return id.length <= 150 ? id : `sha256:${createHash("sha256").update(id).digest("hex")}`;
}
