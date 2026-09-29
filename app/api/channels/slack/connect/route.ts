import { NextResponse } from "next/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { buildSlackAuthorizeUrl, getSlackConfig } from "@/modules/channels/slack/slack-api";
import {
  newSlackOAuthState,
  SLACK_CALLBACK_PATH,
  SLACK_STATE_COOKIE,
  SLACK_STATE_TTL_SECONDS,
  settingsResultUrl,
  slackRedirectUri,
} from "@/modules/channels/slack/slack-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings → Integrations → Connect Slack. Starts the OAuth v2 install for the
 * signed-in user; the callback links THEIR Slack account to them. The same
 * permission as capturing: the account only ever feeds that user's Inbox.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const config = getSlackConfig();
  if (!config) return NextResponse.redirect(settingsResultUrl(request.url, "not_configured"));

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "planner.entry.create", intent: "write" });
  } catch (error) {
    if (isAccessError(error)) return NextResponse.redirect(settingsResultUrl(request.url, "forbidden"));
    throw error;
  }

  const { state, cookie } = newSlackOAuthState(ctx.org.id, ctx.user.id);
  const response = NextResponse.redirect(buildSlackAuthorizeUrl(config, state.state, slackRedirectUri(request.url)));
  response.cookies.set(SLACK_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SLACK_CALLBACK_PATH,
    maxAge: SLACK_STATE_TTL_SECONDS,
  });
  return response;
}
