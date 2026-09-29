import { after, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { getSlackConfig, postSlackEphemeral, verifySlackSignature } from "@/modules/channels/slack/slack-api";
import { handleSlackShortcut } from "@/modules/channels/slack/handle-slack-shortcut";
import { parseSlackInteraction } from "@/modules/channels/slack/slack-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A message shortcut payload is a few KB; a long message is capped by the intake anyway. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Slack interactivity endpoint (ADR 002, step 3) — the "Send to Nevora" message
 * shortcut.
 *
 * Machine route (listed in MACHINE_ROUTES): there is no session. Every request
 * is authenticated by Slack's signing secret over the raw body, with a
 * five-minute replay window, and fails closed: 503 when Slack is not
 * configured, 401 on a bad signature.
 *
 * Slack expects an answer within three seconds. The capture is stored before
 * answering; the AI step and the ephemeral reply that reports it run after the
 * response, through the payload's `response_url`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getSlackConfig();
  const supabase = getServiceRoleClient();
  if (!config || !supabase) {
    logger.error("slack.interactivity.misconfigured", { slack: Boolean(config), serviceRole: Boolean(supabase) });
    return NextResponse.json({ error: "Slack is not configured." }, { status: 503 });
  }

  const raw = await request.text().catch(() => null);
  if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const signed = verifySlackSignature(config.signingSecret, raw, {
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!signed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Any other interaction (a global shortcut, a button) is acknowledged unread.
  const payload = parseSlackInteraction(raw);
  if (!payload) return new NextResponse(null, { status: 200 });

  try {
    const result = await handleSlackShortcut(payload, {
      supabase,
      respond: (text) => postSlackEphemeral(payload.response_url, text),
      appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, ""),
    });
    if (result.after) {
      const work = result.after;
      after(async () => {
        try {
          await work();
        } catch (error) {
          logger.error("slack.interactivity.after_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
    logger.info("slack.interactivity.handled", { action: result.action });
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    // Slack shows the user its own error for a non-2xx; it does not redeliver.
    logger.error("slack.interactivity.failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not process the shortcut." }, { status: 500 });
  }
}
