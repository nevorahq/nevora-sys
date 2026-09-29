import { NextResponse, type NextRequest } from "next/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { exchangeSlackCode, getSlackConfig, slackExternalUserId } from "@/modules/channels/slack/slack-api";
import {
  readSlackOAuthState,
  SLACK_CALLBACK_PATH,
  SLACK_STATE_COOKIE,
  settingsResultUrl,
  slackRedirectUri,
  slackStateMatches,
  type SlackConnectResult,
} from "@/modules/channels/slack/slack-oauth";
import { linkExternalAccount } from "@/modules/channels/services/link-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Slack OAuth v2 callback. Links the Slack user who completed the install
 * (`authed_user`) to the signed-in Nevora user who started it. Integrations are
 * written by the server only (migration 121 grants users no INSERT), so the row
 * is created with the service-role client — for exactly the session's user,
 * organization and workspace. The bot token Slack returns is not kept.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const done = (result: SlackConnectResult) => {
    const response = NextResponse.redirect(settingsResultUrl(request.url, result));
    response.cookies.set(SLACK_STATE_COOKIE, "", { path: SLACK_CALLBACK_PATH, maxAge: 0 });
    return response;
  };

  const expected = readSlackOAuthState(request.cookies.get(SLACK_STATE_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  if (!expected || !slackStateMatches(expected.state, params.get("state"))) return done("invalid_state");
  if (params.get("error")) return done("denied");
  const code = params.get("code");
  if (!code) return done("failed");

  const config = getSlackConfig();
  const service = getServiceRoleClient();
  if (!config || !service) return done("not_configured");

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "planner.entry.create", intent: "write" });
  } catch (error) {
    if (isAccessError(error)) return done("forbidden");
    throw error;
  }
  // Started by another account or in another organization (switched meanwhile).
  if (ctx.org.id !== expected.organizationId || ctx.user.id !== expected.userId) return done("invalid_state");

  const install = await exchangeSlackCode(config, code, slackRedirectUri(request.url));
  const externalUserId = install ? slackExternalUserId(install, install.userId) : null;
  if (!install || !externalUserId) return done("failed");

  const linked = await linkExternalAccount(
    service,
    "slack",
    { organizationId: ctx.org.id, workspaceId: ctx.workspace.id, userId: ctx.user.id },
    { userId: externalUserId, chatId: null, username: null },
    { team_id: install.teamId, team_name: install.teamName, enterprise_id: install.enterpriseId },
  );
  if (!linked.ok) return done("failed");

  logger.info("slack.oauth.linked", { organizationId: ctx.org.id });
  return done("connected");
}
