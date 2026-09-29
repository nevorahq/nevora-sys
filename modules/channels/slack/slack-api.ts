import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/observability/logger";

/**
 * Minimal Slack client for the capture adapter (ADR 002, step 3) — only what
 * the "Send to Nevora" message shortcut needs: request signing, the OAuth v2
 * install that identifies the user, and ephemeral replies through the
 * interaction's `response_url`.
 *
 * The app asks for the `commands` scope only. It never reads channels, and the
 * bot token the install returns is not stored: replies go through
 * `response_url`, which needs no token.
 */

const OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access";
const TIMEOUT_MS = 8_000;

/** The single scope the app requests: shortcuts. */
export const SLACK_SCOPES = ["commands"] as const;
/** The message shortcut's callback id — must match the Slack app manifest. */
export const SLACK_SHORTCUT_CALLBACK_ID = "send_to_nevora";
/** Slack rejects replays older than this; so do we. */
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

/** Null unless the client id, client secret and signing secret are all set. */
export function getSlackConfig(): SlackConfig | null {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!clientId || !clientSecret || !signingSecret) return null;
  return { clientId, clientSecret, signingSecret };
}

/**
 * Verify Slack's request signature: `v0=` + HMAC-SHA256 of
 * `v0:<timestamp>:<raw body>` with the signing secret, and a timestamp no
 * older (or newer) than five minutes, so a captured request cannot be replayed.
 */
export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  headers: { timestamp: string | null; signature: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (!headers.timestamp || !headers.signature) return false;
  if (!/^\d{1,12}$/.test(headers.timestamp)) return false;
  const timestamp = Number(headers.timestamp);
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > SIGNATURE_MAX_AGE_SECONDS) return false;

  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${headers.timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(headers.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildSlackAuthorizeUrl(config: SlackConfig, state: string, redirectUri: string): string {
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

const oauthAccessSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  team: z.object({ id: z.string().min(1), name: z.string().optional() }).nullish(),
  enterprise: z.object({ id: z.string().min(1), name: z.string().optional() }).nullish(),
  authed_user: z.object({ id: z.string().min(1) }).nullish(),
});

export interface SlackInstall {
  /** The Slack user who completed the install — the account being linked. */
  userId: string;
  teamId: string | null;
  teamName: string | null;
  enterpriseId: string | null;
}

/**
 * Exchange the OAuth code for the install. Only the identity is kept: which
 * Slack user, in which workspace (or Enterprise Grid org). The returned bot
 * token is deliberately dropped. Never throws.
 */
export async function exchangeSlackCode(config: SlackConfig, code: string, redirectUri: string): Promise<SlackInstall | null> {
  try {
    const response = await fetch(OAUTH_ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = oauthAccessSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || !parsed.data.ok) {
      logger.warn("slack.oauth.exchange_failed", {
        status: response.status,
        error: parsed.success ? parsed.data.error : "unparseable",
      });
      return null;
    }
    const data = parsed.data;
    if (!data.authed_user?.id || (!data.team?.id && !data.enterprise?.id)) return null;
    return {
      userId: data.authed_user.id,
      teamId: data.team?.id ?? null,
      teamName: data.team?.name ?? data.enterprise?.name ?? null,
      enterpriseId: data.enterprise?.id ?? null,
    };
  } catch (error) {
    logger.warn("slack.oauth.exchange_threw", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * The stable identity of a Slack user as stored in `external_user_id`: the
 * Enterprise Grid org when there is one (user ids are org-wide there),
 * otherwise the workspace — both the install and the shortcut derive it the
 * same way.
 */
export function slackExternalUserId(scope: { enterpriseId: string | null; teamId: string | null }, userId: string): string | null {
  const owner = scope.enterpriseId ?? scope.teamId;
  return owner ? `${owner}:${userId}` : null;
}

/** Only Slack's own hooks host is ever posted to, whatever the payload says. */
export function isSlackResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

/**
 * An ephemeral reply — visible only to the user who ran the shortcut — through
 * the interaction's `response_url`. Plain text: user content is echoed back,
 * so the three characters Slack treats as control are escaped. Never throws.
 */
export async function postSlackEphemeral(responseUrl: string, text: string): Promise<boolean> {
  if (!isSlackResponseUrl(responseUrl)) return false;
  try {
    const response = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text: escapeSlackText(text).slice(0, 3000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("slack.respond.failed", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn("slack.respond.threw", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
