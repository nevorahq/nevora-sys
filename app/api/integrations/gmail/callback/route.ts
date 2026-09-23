import { NextResponse, type NextRequest } from "next/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import {
  exchangeGoogleAuthorizationCode,
  getGmailProfile,
} from "@/modules/integrations/gmail/gmail-api";
import { getGmailConfig, GMAIL_READONLY_SCOPE } from "@/modules/integrations/gmail/gmail-config";
import { getGmailConnection, saveGmailConnection } from "@/modules/integrations/gmail/gmail-store";
import { decryptGmailToken, encryptGmailToken } from "@/modules/integrations/gmail/token-crypto";

export const runtime = "nodejs";

const STATE_COOKIE = "nevora_gmail_oauth_state";

type OAuthState = { state: string; subscriptionId: string };

function readOAuthState(request: NextRequest): OAuthState | null {
  const value = request.cookies.get(STATE_COOKIE)?.value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<OAuthState>;
    return typeof parsed.state === "string" && typeof parsed.subscriptionId === "string"
      ? parsed as OAuthState
      : null;
  } catch {
    return null;
  }
}

function callbackRedirect(request: NextRequest, subscriptionId: string, result: string): NextResponse {
  const url = new URL(`/subscriptions/${encodeURIComponent(subscriptionId)}`, request.url);
  url.searchParams.set("gmail", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, "", { path: "/api/integrations/gmail/callback", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const oauthState = readOAuthState(request);
  if (!oauthState) return NextResponse.json({ error: "The Gmail authorization session expired." }, { status: 400 });

  const url = request.nextUrl;
  if (url.searchParams.get("state") !== oauthState.state) {
    return callbackRedirect(request, oauthState.subscriptionId, "invalid_state");
  }
  if (url.searchParams.get("error")) {
    return callbackRedirect(request, oauthState.subscriptionId, "denied");
  }
  const code = url.searchParams.get("code");
  if (!code) return callbackRedirect(request, oauthState.subscriptionId, "failed");

  try {
    const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
    const config = getGmailConfig();
    const token = await exchangeGoogleAuthorizationCode(code);
    const grantedScopes = token.scope?.split(" ").filter(Boolean) ?? [GMAIL_READONLY_SCOPE];
    if (!grantedScopes.includes(GMAIL_READONLY_SCOPE)) {
      throw new Error("Google did not grant read-only Gmail access.");
    }
    const profile = await getGmailProfile(token.access_token);

    let refreshToken = token.refresh_token;
    if (!refreshToken) {
      const existing = await getGmailConnection(ctx.org.id, ctx.user.id);
      if (existing) refreshToken = decryptGmailToken(existing.refreshTokenCiphertext, config.tokenEncryptionKey);
    }
    if (!refreshToken) throw new Error("Google did not return offline access. Reconnect Gmail and grant access.");

    await saveGmailConnection({
      organizationId: ctx.org.id,
      userId: ctx.user.id,
      gmailAddress: profile.emailAddress,
      refreshTokenCiphertext: encryptGmailToken(refreshToken, config.tokenEncryptionKey),
      scopes: grantedScopes,
    });
    return callbackRedirect(request, oauthState.subscriptionId, "connected");
  } catch (error) {
    if (!isAccessError(error)) console.error("Gmail OAuth callback failed", error);
    return callbackRedirect(request, oauthState.subscriptionId, "failed");
  }
}
