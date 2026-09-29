import "server-only";
import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import type { ReceivedEmail } from "./email-content";

/**
 * Resend Inbound (receiving) — the email channel's transport. The
 * `email.received` webhook carries metadata only; the body, headers,
 * authentication results and attachment download URLs come from the receiving
 * API, which is what keeps large attachments out of the webhook body.
 */

export interface EmailChannelConfig {
  apiKey: string;
  webhookSecret: string;
  /** The receiving domain, e.g. `in.nevora.app` or `<id>.resend.app`. */
  domain: string;
  /** Sender for the few replies the channel sends (rejections only). */
  from: string | null;
}

/** Null unless the API key, the webhook secret and the receiving domain are set. */
export function getEmailChannelConfig(): EmailChannelConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  if (!apiKey || !webhookSecret || !domain) return null;
  return { apiKey, webhookSecret, domain, from: process.env.RESEND_FROM_EMAIL?.trim() || null };
}

export interface InboundEmailEvent {
  type: string;
  data: { email_id: string; to: string[]; from: string; message_id: string };
}

/**
 * Verify the Svix/Standard Webhooks signature over the RAW body. Null when the
 * signature, timestamp or payload is wrong.
 */
export function verifyInboundWebhook(
  config: EmailChannelConfig,
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): InboundEmailEvent | null {
  if (!headers.id || !headers.timestamp || !headers.signature) return null;
  try {
    const event = new Resend(config.apiKey).webhooks.verify({
      payload: rawBody,
      headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
      webhookSecret: config.webhookSecret,
    }) as unknown as InboundEmailEvent;
    return event && typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
}

export interface InboundAttachmentMeta {
  id: string;
  filename: string | null;
  contentType: string;
  size: number | null;
  inline: boolean;
}

export type FetchedEmail = ReceivedEmail & { to: string[]; attachments: InboundAttachmentMeta[] };

export async function fetchReceivedEmail(config: EmailChannelConfig, emailId: string): Promise<FetchedEmail | null> {
  const { data, error } = await new Resend(config.apiKey).emails.receiving.get(emailId, { html_format: "cid" });
  if (error || !data) {
    logger.warn("email_channel.fetch.failed", { emailId, error: error?.message });
    return null;
  }
  // `authentication` is in the API response but not yet in the SDK's type.
  const authentication = (data as unknown as { authentication?: ReceivedEmail["authentication"] }).authentication ?? null;
  return {
    from: data.from,
    to: data.to ?? [],
    subject: data.subject ?? "",
    text: data.text,
    html: data.html,
    headers: data.headers,
    messageId: data.message_id,
    authentication,
    attachments: (data.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.content_type,
      size: typeof attachment.size === "number" ? attachment.size : null,
      // Inline parts referenced from the HTML are logos and signatures, not documents.
      inline: attachment.content_disposition === "inline" && Boolean(attachment.content_id),
    })),
  };
}

export type AttachmentDownload = { ok: true; bytes: ArrayBuffer } | { ok: false; reason: "too_large" | "failed" };

/** Download one attachment through its short-lived signed URL, capped at `maxBytes`. */
export async function downloadInboundAttachment(
  config: EmailChannelConfig,
  emailId: string,
  attachmentId: string,
  maxBytes: number,
): Promise<AttachmentDownload> {
  try {
    const { data, error } = await new Resend(config.apiKey).emails.receiving.attachments.get({ emailId, id: attachmentId });
    if (error || !data?.download_url) return { ok: false, reason: "failed" };
    if (data.size > maxBytes) return { ok: false, reason: "too_large" };
    const response = await fetch(data.download_url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { ok: false, reason: "failed" };
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > maxBytes ? { ok: false, reason: "too_large" } : { ok: true, bytes };
  } catch (error) {
    logger.warn("email_channel.attachment.failed", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "failed" };
  }
}

/** A short plain-text notice to the owner (rejections only). Never throws. */
export async function sendChannelNotice(config: EmailChannelConfig, to: string, subject: string, text: string): Promise<void> {
  if (!config.from) return;
  try {
    await new Resend(config.apiKey).emails.send({ from: config.from, to: [to], subject, text });
  } catch (error) {
    logger.warn("email_channel.notice.failed", { error: error instanceof Error ? error.message : String(error) });
  }
}
