import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { ROUTES } from "@/shared/config/routes";

/**
 * The Slack install round trip (Settings → Slack → back to Settings). The
 * `state` parameter is bound to an httpOnly cookie scoped to the callback path
 * and to the user and organization that started it, so a callback cannot be
 * forged (CSRF) or completed by another signed-in account.
 */

export const SLACK_STATE_COOKIE = "nevora_slack_oauth_state";
export const SLACK_CALLBACK_PATH = "/api/channels/slack/callback";
export const SLACK_STATE_TTL_SECONDS = 10 * 60;

export interface SlackOAuthState {
  state: string;
  organizationId: string;
  userId: string;
}

/** Outcomes shown in Settings (`?slack=`). */
export const SLACK_CONNECT_RESULTS = ["connected", "denied", "failed", "invalid_state", "not_configured", "forbidden"] as const;
export type SlackConnectResult = (typeof SLACK_CONNECT_RESULTS)[number];

export function newSlackOAuthState(organizationId: string, userId: string): { state: SlackOAuthState; cookie: string } {
  const state: SlackOAuthState = { state: randomBytes(24).toString("base64url"), organizationId, userId };
  return { state, cookie: Buffer.from(JSON.stringify(state), "utf8").toString("base64url") };
}

export function readSlackOAuthState(cookie: string | undefined): SlackOAuthState | null {
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as Partial<SlackOAuthState>;
    return typeof parsed.state === "string" && typeof parsed.organizationId === "string" && typeof parsed.userId === "string"
      ? { state: parsed.state, organizationId: parsed.organizationId, userId: parsed.userId }
      : null;
  } catch {
    return null;
  }
}

export function slackStateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The public app origin — Slack requires the same redirect URI on both legs. */
export function appOrigin(requestUrl: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(requestUrl).origin).replace(/\/$/, "");
}

export function slackRedirectUri(requestUrl: string): string {
  return `${appOrigin(requestUrl)}${SLACK_CALLBACK_PATH}`;
}

export function settingsResultUrl(requestUrl: string, result: SlackConnectResult): string {
  const url = new URL(ROUTES.settingsIntegrations, `${appOrigin(requestUrl)}/`);
  url.searchParams.set("slack", result);
  return url.toString();
}
