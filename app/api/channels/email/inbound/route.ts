import { after, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { handleInboundEmail } from "@/modules/channels/email/handle-inbound-email";
import {
  downloadInboundAttachment,
  fetchReceivedEmail,
  getEmailChannelConfig,
  sendChannelNotice,
  verifyInboundWebhook,
} from "@/modules/channels/email/resend-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The event is metadata only (bodies and files are fetched), so it stays small. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Resend Inbound webhook — email forwarding (ADR 002, step 4).
 *
 * Machine route (listed in MACHINE_ROUTES): no session. It authenticates with
 * the Svix / Standard Webhooks signature over the raw body and fails closed:
 * 503 when not configured, 401 on a bad signature.
 *
 * Captures are stored before answering 200; a transient failure answers 500 and
 * Resend redelivers (the per-message keys keep it to one capture). Reading —
 * task detection and document extraction — runs after the response.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getEmailChannelConfig();
  const supabase = getServiceRoleClient();
  if (!config || !supabase) {
    logger.error("email_channel.webhook.misconfigured", { email: Boolean(config), serviceRole: Boolean(supabase) });
    return NextResponse.json({ error: "Email forwarding is not configured." }, { status: 503 });
  }

  const raw = await request.text().catch(() => null);
  if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const event = verifyInboundWebhook(config, raw, {
    id: request.headers.get("svix-id") ?? request.headers.get("webhook-id"),
    timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp"),
    signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature"),
  });
  if (!event) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await handleInboundEmail(event, {
      supabase,
      domain: config.domain,
      fetchEmail: (emailId) => fetchReceivedEmail(config, emailId),
      downloadAttachment: (emailId, attachmentId, maxBytes) => downloadInboundAttachment(config, emailId, attachmentId, maxBytes),
      ownerEmail: async (userId) => {
        const { data } = await supabase.auth.admin.getUserById(userId);
        return data.user?.email?.toLowerCase() ?? null;
      },
      notify: (to, subject, text) => sendChannelNotice(config, to, subject, text),
    });
    if (result.after) {
      const work = result.after;
      after(async () => {
        try {
          await work();
        } catch (error) {
          logger.error("email_channel.webhook.after_failed", { error: error instanceof Error ? error.message : String(error) });
        }
      });
    }
    logger.info("email_channel.webhook.handled", { action: result.action });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("email_channel.webhook.failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not process the email." }, { status: 500 });
  }
}
